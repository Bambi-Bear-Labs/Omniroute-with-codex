import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { planConfiguration, publicPlan, applyConfiguration, configurationText } from '../scripts/lib/configuration.mjs';
import { configure } from '../scripts/configure-codex.mjs';
import { setup } from '../scripts/setup.mjs';
import { fileURLToPath } from 'node:url';
const REPO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function withHome(fn) {
  const rootDir = path.join(REPO_DIR, '.tmp-test-homes');
  fs.mkdirSync(rootDir, { recursive: true });
  const testRoot = fs.realpathSync(rootDir);
  const home = fs.mkdtempSync(path.join(testRoot, 'omniroute-codex-test-'));
  try { return await fn(home); }
  finally {
    const resolved = fs.realpathSync(home);
    assert.equal(path.dirname(resolved), testRoot);
    assert.ok(path.basename(resolved).startsWith('omniroute-codex-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
const options=(home,mode='cli',extra={})=>({home,mode,model:'grok-cli/grok-4.7',...extra});
const safePlan=o=>planConfiguration(o,{systemPolicyPath:path.join(o.home,'synthetic-system-policy')});
const preflight=async()=>({bridgeHealthy:true,normalizationVersion:2,discoveryMatches:true,selectedModelAvailable:true});

test('CLI preview and application preserve main config; repeat is idempotent',()=>withHome(home=>{
  const base=path.join(home,'config.toml');
  const original='model = "native-model"\n[features]\nmemories = true\n';
  fs.writeFileSync(base,original);
  const plan=safePlan(options(home));
  assert.equal(plan.changed,true);assert.equal(fs.readdirSync(home).length,1);
  assert.equal(publicPlan(plan).mainConfigWouldChange,false);
  const result=applyConfiguration(plan);
  assert.equal(result.status,'applied');assert.equal(fs.readFileSync(base,'utf8'),original);
  const profile=path.join(home,'omniroute-bridge.config.toml');
  assert.match(fs.readFileSync(profile,'utf8'),/model_provider = "omniroute_bridge"/);
  const second=safePlan(options(home));assert.equal(second.changed,false);
  const stateBefore=fs.readFileSync(second.stateFile,'utf8');
  assert.equal(applyConfiguration(second).status,'unchanged');
  assert.equal(fs.readFileSync(second.stateFile,'utf8'),stateBefore);
  assert.equal(applyConfiguration(safePlan(options(home,'cli',{rollback:true}))).status,'rolled_back');
  assert.equal(fs.existsSync(profile),false);assert.equal(fs.readFileSync(base,'utf8'),original);
}));

test('desktop changes only selected root keys and owned provider, preserving CRLF and private settings',()=>withHome(home=>{
  const base=path.join(home,'config.toml');
  const original='\uFEFF# existing config\r\nmodel = \'native\' # keep this note\r\nmodel_provider = "openai"\r\nnotify = [\r\n  ["one", "two"],\r\n]\r\nmodel_catalog_json = \'C:\\Users\\Public\\models.json\'\r\n[plugins.example]\r\nenabled = true\r\n[mcp_servers.example]\r\ncommand = "synthetic-private-sentinel"\r\n';
  fs.writeFileSync(base,original);
  const plan=safePlan(options(home,'desktop'));
  assert.equal(publicPlan(plan).mainConfigWouldChange,true);
  assert.equal(JSON.stringify(publicPlan(plan)).includes('synthetic-private-sentinel'),false);
  const result=applyConfiguration(plan);assert.equal(result.status,'applied');
  const next=fs.readFileSync(base,'utf8');
  assert.ok(next.startsWith('\uFEFF# existing config\r\n'));
  assert.ok(next.includes('model = "grok-cli/grok-4.7" # keep this note'));
  assert.ok(next.includes('[mcp_servers.example]\r\ncommand = "synthetic-private-sentinel"'));
  assert.ok(next.includes("model_catalog_json = 'C:\\Users\\Public\\models.json'"));
  assert.equal(/(?<!\r)\n/.test(next),false);
  assert.equal(safePlan(options(home,'desktop')).changed,false);
  assert.equal(applyConfiguration(safePlan(options(home,'desktop',{rollback:true}))).status,'rolled_back');
  assert.equal(fs.readFileSync(base,'utf8'),original);
}));

test('an unowned profile or provider is never overwritten',()=>withHome(home=>{
  fs.writeFileSync(path.join(home,'omniroute-bridge.config.toml'),'model = "other"\n');
  assert.throws(()=>safePlan(options(home)),e=>e.code==='profile_conflict');
  fs.writeFileSync(path.join(home,'config.toml'),'[model_providers."omniroute_bridge"]\nbase_url="http://example.invalid"\n');
  assert.throws(()=>safePlan(options(home,'desktop')),e=>e.code==='provider_conflict');
}));

test('ambiguous, complex, managed or unsafe config is rejected without edits',()=>withHome(home=>{
  const base=path.join(home,'config.toml');
  for(const content of ['model = "a"\nmodel = "b"\n','"model" = "a"\n','description = """text"""\n','model = "a"\r\nmodel_provider = "b"\n']){
    fs.writeFileSync(base,content);
    assert.throws(()=>safePlan(options(home,'desktop')),e=>e.code==='manual_review');
    assert.equal(fs.readFileSync(base,'utf8'),content);
  }
  fs.writeFileSync(path.join(home,'requirements.toml'),'# managed\n');
  assert.throws(()=>safePlan(options(home)),e=>e.code==='managed_policy');
  for(const profile of ['../outside','CON','bad.name']) assert.throws(()=>safePlan(options(home,'cli',{profile})),e=>e.code==='invalid_profile');
}));

test('rollback refuses to erase later edits and retains original backups',()=>withHome(home=>{
  const base=path.join(home,'config.toml');const original='model = "native"\n[features]\nmemories=true\n';fs.writeFileSync(base,original);
  const applied=applyConfiguration(safePlan(options(home,'desktop')));
  assert.equal(fs.readFileSync(applied.backup,'utf8'),original);
  fs.appendFileSync(base,'\n# user changed this later\n');
  const changed=fs.readFileSync(base,'utf8');
  assert.throws(()=>applyConfiguration(safePlan(options(home,'desktop',{rollback:true}))),e=>e.code==='concurrent_edit');
  assert.equal(fs.readFileSync(base,'utf8'),changed);assert.ok(fs.existsSync(applied.backup));
}));

test('concurrent target and state changes are detected before writing',()=>withHome(home=>{
  const base=path.join(home,'config.toml');fs.writeFileSync(base,'model = "native"\n');
  const stale=safePlan(options(home,'desktop'));fs.appendFileSync(base,'# later\n');
  assert.throws(()=>applyConfiguration(stale),e=>e.code==='concurrent_edit');
  assert.ok(fs.readFileSync(base,'utf8').includes('# later'));
  const first=applyConfiguration(safePlan(options(home,'desktop')));
  const next=safePlan(options(home,'desktop',{model:'grok-cli/grok-4.6'}));
  fs.appendFileSync(next.stateFile,' ');
  assert.throws(()=>applyConfiguration(next),e=>e.code==='concurrent_edit');
  assert.equal(fs.existsSync(first.backup),true);
}));

test('setup preview and failed preflight never apply a configuration',()=>withHome(async home=>{
  const args=['--mode','desktop','--model','grok-cli/grok-4.7','--codex-home',home];
  const plan=raw=>planConfiguration(raw,{systemPolicyPath:path.join(home,'synthetic-system-policy')});
  const preview=await setup(args,{plan});assert.equal(preview.status,'dry_run');assert.equal(preview.writesPerformed,false);
  assert.equal(fs.readdirSync(home).length,0);
  let ensured=false;
  await assert.rejects(()=>setup([...args,'--apply'],{platform:'win32',plan,direct:async()=>{throw new Error('unavailable')},ensure:()=>{ensured=true}}));
  assert.equal(ensured,false);assert.equal(fs.readdirSync(home).length,0);
  await assert.rejects(()=>configure([...args,'--apply'],{plan,preflight:async()=>{throw new Error('unavailable')}}));
  assert.equal(fs.readdirSync(home).length,0);
}));

test('setup order checks direct gateway before service and bridge before config',()=>withHome(async home=>{
  const events=[];
  const result=await setup(['--mode','cli','--model','grok-cli/grok-4.7','--codex-home',home,'--apply'],{
    platform:'win32',plan:raw=>planConfiguration(raw,{systemPolicyPath:path.join(home,'synthetic-system-policy')}),direct:async()=>{events.push('direct')},
    ensure:()=>{events.push('bridge');return {action:'reused',status:'ready'}},
    preflight:async()=>{events.push('preflight');return preflight()}
  });
  assert.deepEqual(events,['direct','bridge','preflight']);assert.equal(result.configuration.status,'applied');
  assert.equal(result.credentialsWritten,false);assert.equal(result.omnirouteInstalledOrStarted,false);
}));

test('desktop output refuses a second provider table outside its owned block',()=>withHome(home=>{
  const original='model="native"\n';const managed=configurationText(original,options(home,'desktop'));
  const collision=managed+'\n[model_providers."omniroute_bridge"]\nname="other"\n';
  assert.throws(()=>configurationText(collision,options(home,'desktop')),e=>e.code==='ownership_conflict');
}));

test('desktop refuses inline, dotted and escaped provider definitions',()=>withHome(home=>{
  for(const content of [
    'model_providers = { omniroute_bridge = {} }\n',
    'model_providers.omniroute_bridge.name = "other"\n',
    '[model_providers]\nother = {}\n',
    '["model\\u005fproviders".omniroute_bridge]\nname="other"\n'
  ]) {
    fs.writeFileSync(path.join(home,'config.toml'),content);
    assert.throws(()=>safePlan(options(home,'desktop')),e=>['provider_conflict','manual_review'].includes(e.code));
    assert.equal(fs.readFileSync(path.join(home,'config.toml'),'utf8'),content);
  }
}));

test('rollback refuses a tampered backup path outside the managed backup directory',()=>withHome(home=>{
  const base=path.join(home,'config.toml');const original='model = "native"\n';fs.writeFileSync(base,original);
  const applied=applyConfiguration(safePlan(options(home,'desktop')));
  const state=JSON.parse(fs.readFileSync(applied.stateFile,'utf8'));
  const outside=path.join(home,'unrelated.toml');fs.writeFileSync(outside,original);
  state.original.backup=outside;fs.writeFileSync(applied.stateFile,JSON.stringify(state));
  assert.throws(()=>applyConfiguration(safePlan(options(home,'desktop',{rollback:true}))),e=>e.code==='unsafe_path');
  assert.notEqual(fs.readFileSync(base,'utf8'),original);
}));

test('rollback refuses a concurrently changed state file',()=>withHome(home=>{
  fs.writeFileSync(path.join(home,'config.toml'),'model="native"\n');
  const applied=applyConfiguration(safePlan(options(home,'desktop')));
  const rollback=safePlan(options(home,'desktop',{rollback:true}));
  const current=fs.readFileSync(rollback.target,'utf8');fs.appendFileSync(applied.stateFile,' ');
  assert.throws(()=>applyConfiguration(rollback),e=>e.code==='concurrent_edit');
  assert.equal(fs.readFileSync(rollback.target,'utf8'),current);
}));

test('hard-linked targets are rejected to protect other files',t=>withHome(home=>{
  const other=path.join(home,'other.toml');fs.writeFileSync(other,'model="native"\n');
  try{fs.linkSync(other,path.join(home,'config.toml'))}catch(error){if(['EPERM','ENOTSUP','EACCES'].includes(error.code)){t.skip('Hard links unavailable');return}throw error}
  assert.throws(()=>safePlan(options(home,'desktop')),e=>e.code==='unsafe_path');
  assert.equal(fs.readFileSync(other,'utf8'),'model="native"\n');
}));

test('a key-shaped model argument is rejected without exposing its value',()=>withHome(home=>{
  const fake='sk-'+('x'.repeat(40));
  assert.throws(()=>safePlan(options(home,'cli',{model:fake})),e=>e.code==='model_required'&&!e.message.includes(fake));
}));

test('a stale no-change plan does not falsely report success',()=>withHome(home=>{
  const first=applyConfiguration(safePlan(options(home)));
  const stale=safePlan(options(home));assert.equal(stale.changed,false);
  fs.appendFileSync(stale.target,'# later edit\n');
  assert.throws(()=>applyConfiguration(stale),e=>e.code==='concurrent_edit');
  assert.ok(fs.readFileSync(stale.target,'utf8').includes('# later edit'));
  assert.equal(first.status,'applied');
}));

test('partial file writes are retried until every byte is preserved',()=>withHome(home=>{
  const base=path.join(home,'config.toml');fs.writeFileSync(base,'model = "native"\n[features]\nmemories=true\n');
  const plan=safePlan(options(home,'desktop'));const original=fs.writeSync;
  try{
    fs.writeSync=(fd,buffer,offset,length,position)=>original(fd,buffer,offset,Math.min(length,7),position);
    const result=applyConfiguration(plan);assert.equal(result.status,'applied');
  }finally{fs.writeSync=original}
  assert.equal(fs.readFileSync(base,'utf8'),plan.after);
}));

test('rollback preview detects later edits before suggesting an apply',()=>withHome(home=>{
  const base=path.join(home,'config.toml');fs.writeFileSync(base,'model="native"\n');
  applyConfiguration(safePlan(options(home,'desktop')));fs.appendFileSync(base,'# later user change\n');
  assert.throws(()=>safePlan(options(home,'desktop',{rollback:true})),e=>e.code==='concurrent_edit');
  assert.ok(fs.readFileSync(base,'utf8').includes('# later user change'));
}));

test('a managed provider ID cannot be silently switched after installation',()=>withHome(home=>{
  fs.writeFileSync(path.join(home,'config.toml'),'model="native"\n');
  applyConfiguration(safePlan(options(home,'desktop')));
  assert.throws(()=>safePlan(options(home,'desktop',{provider:'another_provider'})),e=>e.code==='ownership_conflict');
}));

test('nested tables for the managed provider are treated as an ownership conflict',()=>withHome(home=>{
  const base=path.join(home,'config.toml');
  const original='[model_providers.omniroute_bridge.http_headers]\nX = "existing"\n';
  fs.writeFileSync(base,original);
  assert.throws(()=>safePlan(options(home,'desktop')),e=>e.code==='provider_conflict');
  assert.equal(fs.readFileSync(base,'utf8'),original);
}));

test('linked setup-state directories are rejected without touching their targets',t=>withHome(home=>{
  const target=path.join(home,'other-directory');fs.mkdirSync(target);
  const link=path.join(home,'.omniroute-with-codex');
  try{fs.symlinkSync(target,link,process.platform==='win32'?'junction':'dir')}catch(error){if(['EPERM','EACCES','ENOTSUP'].includes(error.code)){t.skip('Directory links unavailable');return}throw error}
  assert.throws(()=>safePlan(options(home)),e=>e.code==='unsafe_path');
  assert.deepEqual(fs.readdirSync(target),[]);
}));

test('CLI configuration rollback returns to the original absence after repeated managed changes',()=>withHome(home=>{
  applyConfiguration(safePlan(options(home)));
  applyConfiguration(safePlan(options(home,'cli',{model:'grok-cli/grok-4.6'})));
  const profile=path.join(home,'omniroute-bridge.config.toml');assert.ok(fs.existsSync(profile));
  applyConfiguration(safePlan(options(home,'cli',{rollback:true})));
  assert.equal(fs.existsSync(profile),false);
}));

test('an already-working manually configured desktop bridge is reused without adding a provider',()=>withHome(home=>{
  const base=path.join(home,'config.toml');
  const original='model_provider = "omniroute"\nmodel = "grok-cli/grok-4.7"\n\n[model_providers.omniroute]\nname = "OmniRoute"\nbase_url = "http://127.0.0.1:20129/v1"\nenv_key = "OMNIROUTE_API_KEY"\nwire_api = "responses"\nhttp_headers = { "x-omniroute-no-memory" = "true" }\n';
  fs.writeFileSync(base,original);
  const plan=safePlan(options(home,'desktop'));
  assert.equal(plan.changed,false);assert.equal(publicPlan(plan).provider,'omniroute');
  assert.equal(applyConfiguration(plan).status,'unchanged');
  assert.equal(fs.readFileSync(base,'utf8'),original);
  assert.equal(fs.existsSync(path.join(home,'.omniroute-with-codex')),false);
}));

test('an existing desktop bridge with a different requested model is not replaced automatically',()=>withHome(home=>{
  const original='model_provider="omniroute"\nmodel="existing/model"\n[model_providers.omniroute]\nbase_url="http://127.0.0.1:20129/v1"\nenv_key="OMNIROUTE_API_KEY"\nwire_api="responses"\nhttp_headers={"x-omniroute-no-memory"="true"}\n';
  const file=path.join(home,'config.toml');fs.writeFileSync(file,original);
  assert.throws(()=>safePlan(options(home,'desktop')),e=>e.code==='manual_review');
  assert.equal(fs.readFileSync(file,'utf8'),original);
}));

test('an existing bridge with an invalid wire setting is not falsely reported as reusable',()=>withHome(home=>{
  const original='model_provider="omniroute"\nmodel="grok-cli/grok-4.7"\n[model_providers.omniroute]\nbase_url="http://127.0.0.1:20129/v1"\nenv_key="OMNIROUTE_API_KEY"\nwire_api=123\nhttp_headers={"x-omniroute-no-memory"="true"}\n';
  fs.writeFileSync(path.join(home,'config.toml'),original);
  assert.throws(()=>safePlan(options(home,'desktop')),e=>e.code==='manual_review');
}));

test('quoted wire keys cannot conceal an incompatible existing provider setting',()=>withHome(home=>{
  const original='model_provider="omniroute"\nmodel="grok-cli/grok-4.7"\n[model_providers.omniroute]\nbase_url="http://127.0.0.1:20129/v1"\nenv_key="OMNIROUTE_API_KEY"\n"wire_api"="chat"\nhttp_headers={"x-omniroute-no-memory"="true"}\n';
  fs.writeFileSync(path.join(home,'config.toml'),original);
  assert.throws(()=>safePlan(options(home,'desktop')),e=>e.code==='manual_review');
}));

test('escaped quoted root keys require review rather than creating duplicate TOML keys',()=>withHome(home=>{
  const original='"\\u006dodel_provider"="omniroute"\nmodel="native"\n';
  fs.writeFileSync(path.join(home,'config.toml'),original);
  assert.throws(()=>safePlan(options(home,'desktop')),e=>e.code==='manual_review');
  assert.equal(fs.readFileSync(path.join(home,'config.toml'),'utf8'),original);
}));

test('repeat setup reuses a working manual desktop config without creating state or touching other settings',()=>withHome(async home=>{
 const original='model_provider="omniroute"\nmodel="grok-cli/grok-4.7"\n[model_providers.omniroute]\nbase_url="http://127.0.0.1:20129/v1"\nenv_key="OMNIROUTE_API_KEY"\nwire_api="responses"\nhttp_headers={"x-omniroute-no-memory"="true"}\n[features]\nmemories=true\n';
 const file=path.join(home,'config.toml');fs.writeFileSync(file,original);
 const result=await setup(['--mode','desktop','--model','grok-cli/grok-4.7','--codex-home',home,'--apply'],{
  platform:'win32',plan:raw=>safePlan(raw),direct:async()=>({}),ensure:()=>({action:'reused',status:'ready'}),preflight:async()=>({discoveryMatches:true})
 });
 assert.equal(result.bridge.action,'reused');assert.equal(result.configuration.status,'unchanged');
 assert.equal(result.configuration.reusedExistingConfiguration,true);assert.equal(result.configuration.rollbackAvailable,false);
 assert.equal(fs.readFileSync(file,'utf8'),original);assert.equal(fs.existsSync(path.join(home,'.omniroute-with-codex')),false);
}));

test('unsupported automated desktop configuration stops before network or writes',()=>withHome(async home=>{
 let checked=false;
 await assert.rejects(()=>configure(['--mode','desktop','--model','sample/model','--codex-home',home,'--apply'],{
  platform:'linux',plan:raw=>planConfiguration(raw,{systemPolicyPath:path.join(home,'synthetic-system-policy')}),preflight:async()=>{checked=true}
 }),e=>e.code==='unsupported_platform');
 assert.equal(checked,false);assert.deepEqual(fs.readdirSync(home),[]);
}));

test('built-in Codex provider identifiers cannot be overridden',()=>withHome(home=>{
  for(const provider of ['openai','ollama','lmstudio','OpenAI']){
    assert.throws(()=>safePlan(options(home,'desktop',{provider})),e=>e.code==='invalid_provider');
  }
  assert.deepEqual(fs.readdirSync(home),[]);
}));

test('multiline nested selection-like keys are not treated as top-level selections',()=>withHome(home=>{
  const text='settings = [\n  {\n    model = "inside"\n  }\n]\n';
  fs.writeFileSync(path.join(home,'config.toml'),text);
  assert.throws(()=>safePlan(options(home,'desktop')),e=>e.code==='manual_review');
  assert.equal(fs.readFileSync(path.join(home,'config.toml'),'utf8'),text);
}));

test('a sandbox-virtualized Codex home is never treated as a host installation',()=>{
  const fake=path.join(os.tmpdir(),'#!sandbox.example','codex');
  assert.throws(()=>planConfiguration({home:fake,mode:'cli',model:'example/model'}),e=>e.code==='unsafe_path');
});
