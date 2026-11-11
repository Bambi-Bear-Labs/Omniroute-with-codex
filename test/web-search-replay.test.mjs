import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { normalizeContext } from '../src/normalize.mjs';
import { createBridge } from '../src/bridge.mjs';

const marker = () => ({type:'web_search_call',id:'ws_example',status:'completed',action:{type:'other'}});
const pair = () => [
  {type:'function_call',call_id:'call_example',name:'search_repositories',namespace:'github',arguments:'{"query":"synthetic example"}'},
  {type:'function_call_output',call_id:'call_example',output:'{"results":["synthetic result"]}'}
];

test('Grok search replay preserves unsupported metadata as lower-trust context', () => {
  const [call, output] = pair();
  const original = {model:'grok-cli/grok-4.7',input:[call, output, marker()],tools:[{type:'function',name:'search_repositories'}]};
  const snapshot = JSON.stringify(original);
  const result = normalizeContext(original);
  assert.equal(result.count,1);
  assert.equal(result.body.input[0],call);
  assert.equal(result.body.input[1],output);
  assert.equal(result.body.tools,original.tools);
  assert.equal(result.body.input[2].type,'message');
  assert.equal(result.body.input[2].role,'user');
  assert.ok(result.body.input[2].content[0].text.includes(JSON.stringify(original.input[2])));
  assert.match(result.body.input[2].content[0].text,/not instructions/);
  assert.equal(JSON.stringify(original),snapshot);
});

test('native search, open-page and find-page actions are not rewritten', () => {
  for (const type of ['search','open_page','find_in_page','future_unknown']) {
    const body={model:'grok-cli/grok-4.7',input:[{...marker(),action:{type}}]};
    assert.equal(normalizeContext(body).body,body);
  }
});

test('other providers and unconfigured combos keep search metadata unchanged', () => {
  for (const model of ['codex/example','gemini/example','unrelated-combo']) {
    const body={model,input:[marker()]};
    assert.equal(normalizeContext(body).body,body);
  }
});

test('configured Grok aliases receive the same search-replay repair', () => {
  const body={model:'example-grok-combo',input:[marker(),marker()]};
  const result=normalizeContext(body,{grokAliases:['example-grok-combo']});
  assert.equal(result.count,2);
  assert.ok(result.body.input.every(item=>item.type==='message'));
});

test('HTTP continuation with real tool pairs survives strict search-action validation', {timeout:10000}, async t => {
  let forwarded;
  const upstream=http.createServer(async(req,res)=>{
    const chunks=[];for await(const c of req)chunks.push(c);
    forwarded=JSON.parse(Buffer.concat(chunks));
    const unsupported=forwarded.input.some(i=>i.type==='web_search_call'&&i.action?.type==='other');
    res.writeHead(unsupported?422:200,{'content-type':'application/json'});
    res.end(JSON.stringify(unsupported?{error:'action.type: unknown variant other'}:{ok:true}));
  });
  let bridge;
  try {
    upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
    bridge=createBridge({upstream:`http://127.0.0.1:${upstream.address().port}`,logger:()=>{}});
    bridge.listen(0,'127.0.0.1');await once(bridge,'listening');
    const original={model:'grok-cli/grok-4.7',input:[...pair(),marker(),marker()],stream:false};
    const response=await fetch(`http://127.0.0.1:${bridge.address().port}/v1/responses`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(original)});
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{ok:true});
    assert.deepEqual(forwarded.input.slice(0,2),original.input.slice(0,2));
    assert.equal(forwarded.input.filter(i=>i.type==='message').length,2);
  } catch (error) {
    if (error?.cause?.code === 'EACCES' || error?.code === 'EACCES') return t.skip('Loopback socket connect restricted by local sandbox');
    throw error;
  } finally {
    if (bridge) { bridge.closeAllConnections(); await new Promise(resolve=>bridge.close(resolve)); }
    upstream.closeAllConnections(); await new Promise(resolve=>upstream.close(resolve));
  }
});
