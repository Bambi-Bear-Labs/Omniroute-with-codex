import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { directGateway, gatewayPreflight, DIRECT_URL, BRIDGE_URL, HEALTH_URL } from '../scripts/lib/gateway.mjs';
import { parseArguments, normalizeAliases, errorResult } from '../scripts/lib/arguments.mjs';
import { windowsBridge } from '../scripts/lib/windows.mjs';
import { setup } from '../scripts/setup.mjs';
import { planConfiguration } from '../scripts/lib/configuration.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function withHome(fn){
 const tmp=fs.realpathSync(os.tmpdir());const home=fs.mkdtempSync(path.join(tmp,'omniroute-codex-agent-test-'));
 try{return await fn(home)}finally{const resolved=fs.realpathSync(home);assert.equal(path.dirname(resolved),tmp);assert.ok(path.basename(resolved).startsWith('omniroute-codex-agent-test-'));fs.rmSync(resolved,{recursive:true,force:true})}
}
const result=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});

test('gateway preflight verifies direct and bridged discovery without exposing the key',async()=>{
 const key='synthetic-private-credential';const calls=[];
 const fake=async(url,options)=>{calls.push({url,options});if(url===HEALTH_URL)return result({id:'codex-grok-context-bridge-v1',normalizationVersion:2});return result({data:[{id:'grok-cli/grok-4.7'},{id:'other/model'}]})};
 const report=await gatewayPreflight({model:'grok-cli/grok-4.7',apiKey:key,fetchImpl:fake});
 assert.equal(report.discoveryMatches,true);assert.equal(report.selectedModelAvailable,true);assert.equal(report.modelCount,2);
 assert.deepEqual(calls.map(c=>c.url),[DIRECT_URL+'/models',HEALTH_URL,BRIDGE_URL+'/models']);
 assert.equal(calls[1].options.headers.Authorization,undefined);
 assert.equal(calls[0].options.headers.Authorization,'Bearer '+key);
 assert.equal(calls[2].options.redirect,'error');
 assert.equal(JSON.stringify(report).includes(key),false);
});

test('preflight stops safely for missing credentials, auth, model, old bridge or differing discovery',async()=>{
 await assert.rejects(()=>directGateway({apiKey:'',fetchImpl:()=>{throw new Error('unexpected')}}),e=>e.code==='credentials_missing');
 await assert.rejects(()=>directGateway({apiKey:'fake',fetchImpl:async()=>result({},401)}),e=>e.code==='authentication_failed');
 await assert.rejects(()=>directGateway({model:'not-found',apiKey:'fake',fetchImpl:async()=>result({data:[{id:'other'}]})}),e=>e.code==='model_unavailable');
 let bridgeCalls=0;
 await assert.rejects(()=>gatewayPreflight({apiKey:'fake',fetchImpl:async(url)=>{if(url===HEALTH_URL)return result({id:'codex-grok-context-bridge-v1',normalizationVersion:1});if(url.startsWith(BRIDGE_URL))bridgeCalls++;return result({data:[{id:'other'}]})}}),e=>e.code==='bridge_revision_old');
 assert.equal(bridgeCalls,0);
 await assert.rejects(()=>gatewayPreflight({apiKey:'fake',fetchImpl:async(url)=>url===HEALTH_URL?result({id:'codex-grok-context-bridge-v1',normalizationVersion:2}):result({data:[{id:url.startsWith(DIRECT_URL)?'one':'two'}]})}),e=>e.code==='discovery_mismatch');
});

test('unsupported key arguments and duplicate flags do not echo supplied values',()=>{
 const secret='fake-value-never-to-print';
 for(const args of [['--api-key='+secret],['--mode','cli','--mode','desktop'],['--model',secret,'--model',secret]]){
  try{parseArguments(args);assert.fail('expected an error')}catch(e){assert.equal(JSON.stringify(errorResult(e)).includes(secret),false)}
 }
});

test('Windows inspector wrapper hides internal subprocess output on errors',()=>{
 const sensitive='synthetic-token-do-not-print';
 assert.throws(()=>windowsBridge('inspect',{platform:'win32',runner:()=>({status:1,stdout:'not json '+sensitive})}),e=>e.code==='task_permission_required'&&!JSON.stringify(errorResult(e)).includes(sensitive));
 const result=windowsBridge('ensure',{platform:'win32',grokAliases:'my-grok-combo',runner:(_,args)=>{
  assert.ok(args.includes('-GrokAliases'));assert.ok(args.includes('my-grok-combo'));return {status:0,stdout:JSON.stringify({status:'ready',action:'reused'})};
 }});
 assert.equal(result.action,'reused');
});

test('partial setup failure reports bridge action and does not alter Codex configuration',()=>withHome(async home=>{
 const base=path.join(home,'config.toml');fs.writeFileSync(base,'model = "native"\n');
 let caught;
 try{await setup(['--mode','desktop','--model','grok-cli/grok-4.7','--codex-home',home,'--apply'],{
  platform:'win32',plan:raw=>planConfiguration(raw,{systemPolicyPath:path.join(home,'synthetic-system-policy')}),direct:async()=>({}),ensure:()=>({action:'installed'}),preflight:async()=>{const e=new Error('Bridge check failed.');e.code='bridge_unavailable';throw e}
 })}catch(error){caught=error}
 assert.equal(caught.effects.bridgeAction,'installed');assert.equal(errorResult(caught).effects.bridgeAction,'installed');
 assert.equal(fs.readFileSync(base,'utf8'),'model = "native"\n');
}));

test('machine-readable CLI dry run needs no network and performs no writes',t=>withHome(home=>{
 const systemPolicy=process.platform==='win32'?path.join(process.env.ProgramData||'C:/ProgramData','OpenAI','Codex','requirements.toml'):'/etc/codex/requirements.toml';
 if(fs.existsSync(systemPolicy)){t.skip('Host has a managed system policy');return}
 const secret='synthetic-key-not-to-be-printed';
 const run=spawnSync(process.execPath,[path.join(root,'scripts/configure-codex.mjs'),'--mode','cli','--model','sample/model','--codex-home',home,'--json'],{encoding:'utf8',env:{...process.env,OMNIROUTE_API_KEY:secret}});
 assert.equal(run.status,0,run.stderr);const plan=JSON.parse(run.stdout);
 assert.equal(plan.status,'dry_run');assert.equal(plan.writesPerformed,false);
 assert.equal(run.stdout.includes(secret),false);assert.equal(fs.readdirSync(home).length,0);
}));

 test('model discovery is bounded and never includes credentials in output',async()=>{
  const {models}=await import('../scripts/models.mjs');
  const result=await models(['--contains','grok','--limit','1','--json'],{direct:async()=>({ids:['other/model','grok/model-a','grok/model-b'],modelCount:3})});
  assert.deepEqual(result.modelIds,['grok/model-a']);assert.equal(result.matchingCount,2);
  assert.equal(result.truncated,true);assert.equal(result.credentialsWritten,false);
  await assert.rejects(()=>models(['--limit','101'],{direct:async()=>{throw new Error('must not execute')}}),e=>e.code==='invalid_arguments');
});

test('synthetic smoke test is preview-only unless explicitly run',async()=>{
 const {smoke}=await import('../scripts/smoke.mjs');let calls=0;
 const result=await smoke(['--model','grok-cli/grok-4.7','--json'],{preflight:async()=>{calls++}});
 assert.equal(result.status,'dry_run');assert.equal(result.modelRequestsPlanned,3);assert.equal(calls,0);
});

test('synthetic smoke verifies a real tool-call shape, continuation and follow-up without echoing secrets',async()=>{
 const {smoke}=await import('../scripts/smoke.mjs');const seen=[];const key='fake-secret-not-to-echo';
 const first={type:'function_call',name:'get_example_value',call_id:'call_synthetic',arguments:'{}'};
 const post=async body=>{
  seen.push(body);
  if(seen.length===1)return {completed:true,output:[first]};
  return {completed:true,visibleLength:1,output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'4'}]}]};
 };
 const result=await smoke(['--model','grok-cli/grok-4.7','--run','--json'],{apiKey:key,preflight:async()=>({}),post});
 assert.equal(result.status,'passed');assert.equal(result.modelRequestsAttempted,3);
 assert.ok(seen.every(body=>body.max_output_tokens===2048));
 assert.equal(result.realGithubApiCalled,false);assert.equal(JSON.stringify(result).includes(key),false);
 assert.ok(seen[1].input.some(item=>item.type==='function_call_output'&&item.call_id==='call_synthetic'));
 assert.ok(seen[1].input.some(item=>item.type==='web_search_call'&&item.action.type==='other'));
 assert.ok(seen[2].input.length>seen[1].input.length);
});

test('smoke failure reports attempted model requests without a secret or false success',async()=>{
 const {smoke}=await import('../scripts/smoke.mjs');let caught;let count=0;
 try{await smoke(['--model','grok-cli/grok-4.7','--run'],{apiKey:'synthetic-key',preflight:async()=>({}),post:async()=>{count++;return count===1?{completed:true,output:[{type:'function_call',name:'get_example_value',call_id:'call_synthetic'}]}:{completed:false,visibleLength:0,output:[]}}})}catch(error){caught=error}
 assert.equal(caught.code,'continuation_missing');assert.equal(caught.effects.modelRequestsAttempted,2);
 assert.equal(JSON.stringify(errorResult(caught)).includes('synthetic-key'),false);
});

test('Grok aliases are explicit, bounded and never accept key-shaped values',()=>{
  assert.deepEqual(normalizeAliases(' alpha, beta,alpha '),['alpha','beta']);
  assert.throws(()=>normalizeAliases(' , '),e=>e.code==='invalid_arguments');
  assert.throws(()=>normalizeAliases('sk-'+('x'.repeat(40))),e=>e.code==='invalid_arguments'&&!e.message.includes('xxxxx'));
  assert.throws(()=>normalizeAliases(Array.from({length:33},(_,i)=>'alias-'+i).join(',')),e=>e.code==='invalid_arguments');
});

test('doctor identifies an absent bridge separately from an unavailable gateway',async()=>{
 const {doctor}=await import('../scripts/doctor.mjs');const {SetupError}=await import('../scripts/lib/configuration.mjs');
 const report=await doctor(['--model','grok-cli/grok-4.7','--json'],{
  direct:async()=>({ids:['grok-cli/grok-4.7'],modelCount:1,selectedModelAvailable:true}),
  preflight:async()=>{throw new SetupError('bridge_unavailable','The bridge is not running.')},
  inspect:()=>({ready:false})
 });
 assert.equal(report.omniroute.authenticated,true);assert.equal(report.issues[0].code,'bridge_unavailable');
 assert.equal(report.ready,false);assert.equal(report.clientConfigurationVerified,false);assert.equal(report.rebootVerified,false);
 await assert.rejects(()=>directGateway({apiKey:'synthetic',fetchImpl:async()=>{throw new Error('sensitive error body')}}),e=>e.code==='omniroute_unavailable'&&!e.message.includes('sensitive'));
});

test('doctor never guesses whether a custom model name is a Grok alias',async()=>{
 const {classifySelectedRoute}=await import('../scripts/doctor.mjs');
 assert.equal(classifySelectedRoute('grok-cli/grok-4.7',null),'native-grok-route');
 assert.equal(classifySelectedRoute('my-combo',{aliasInventoryKnown:false,grokAliases:[]}),'unknown');
 assert.equal(classifySelectedRoute('my-combo',{aliasInventoryKnown:true,grokAliases:['my-combo']}),'configured-grok-alias');
 assert.equal(classifySelectedRoute('MY-COMBO',{aliasInventoryKnown:true,grokAliases:['my-combo']}),'not-configured-as-grok-alias');
});

test('bridge health authorization failures do not misdiagnose a key rejection',async()=>{
 await assert.rejects(()=>gatewayPreflight({apiKey:'fake',fetchImpl:async(url)=>url===HEALTH_URL?result({},403):result({data:[{id:'other'}]})}),e=>e.code==='bridge_unavailable'&&e.message.includes('no key was sent'));
 await assert.rejects(()=>gatewayPreflight({apiKey:'fake',fetchImpl:async(url)=>url===HEALTH_URL?result({id:'codex-grok-context-bridge-v1',normalizationVersion:'2'}):result({data:[{id:'other'}]})}),e=>e.code==='bridge_revision_old');
});

test('desktop mode does not silently ignore a CLI profile option',()=>{
 assert.throws(()=>parseArguments(['--mode','desktop','--profile','example']),e=>e.code==='invalid_arguments');
});

test('doctor explains stopped, missing, old and unowned Windows task states',async()=>{
 const {taskReadinessIssue}=await import('../scripts/lib/windows.mjs');
 assert.equal(taskReadinessIssue({taskExists:false}).code,'bridge_task_missing');
 assert.equal(taskReadinessIssue({taskExists:true,taskOwnedByProject:true,taskRunning:false,bridgeHealthy:true,normalizationVersion:2}).code,'bridge_task_stopped');
 assert.equal(taskReadinessIssue({taskExists:true,taskOwnedByProject:false}).code,'ownership_conflict');
 assert.equal(taskReadinessIssue({taskExists:true,taskOwnedByProject:true,taskRunning:true,bridgeHealthy:true,normalizationVersion:1}).code,'bridge_revision_old');
 assert.equal(taskReadinessIssue({taskExists:true,taskOwnedByProject:true,taskRunning:true,bridgeHealthy:true,normalizationVersion:2}),null);
});
