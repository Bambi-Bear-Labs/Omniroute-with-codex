import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import zlib from "node:zlib";
import { once } from "node:events";
import { normalizeContext, isGrokModel } from "../src/normalize.mjs";
import { createBridge, HEALTH_PATH, BRIDGE_ID } from "../src/bridge.mjs";

const context = (name = "codex_apps_open_page") => ({ type: "function_call_output",
  id: "synthetic_context", name, namespace: "agent", output: '{"page_id":null}' });
const payload = model => ({ model, stream: true, input: [
  { type: "message", role: "developer", content: [{ type: "input_text", text: "Help the user." }] },
  context(), context("codex_apps_selected_page_part_1_of_1"),
  { type: "message", role: "user", content: [{ type: "input_text", text: "What is two plus two?" }] }
] });

test("normalizes standalone context record types including browser_tabs and open_page", () => {
  for (const model of ["grok-cli/grok-4.7", "grok-cli/grok-4.6", "grok-cli/grok-4.5", "gc/grok-4.7"]) {
    const original = payload(model);
    original.input.splice(3, 0, {
      type: "function_call_output",
      name: "browser_tabs",
      namespace: "agent",
      output: '<in-app-browser-context source="ambient-ui-state">\nTabs\n</in-app-browser-context>'
    });
    const snapshot = JSON.stringify(original);
    const result = normalizeContext(original);
    assert.equal(result.count, 3);
    assert.equal(JSON.stringify(original), snapshot, "must not mutate original request");
    assert.equal(result.body.input[1].role, "user");
    assert.equal(result.body.input[1].type, "message");
    assert.ok(result.body.input[1].content[0].text.includes(original.input[1].output));
    assert.equal(result.body.input[3].role, "user");
    assert.equal(result.body.input[3].type, "message");
    assert.ok(result.body.input[3].content[0].text.includes('ambient-ui-state'));
    assert.deepEqual(result.body.input[0], original.input[0]);
    assert.deepEqual(result.body.input[4], original.input[4]);
  }
});

test("leaves unrelated models and valid tool calls untouched", () => {
  for (const model of ["codex/gpt-6.1-sol", "antigravity/gemini-3.8-flash-high", "unrelated-priority-combo", "unrelated-chat-combo"]) {
    const original = payload(model); const result = normalizeContext(original);
    assert.equal(result.count, 0); assert.equal(result.body, original);
  }
  for (const record of [{ ...context(), type: "custom_tool_call_output" }, { ...context(), call_id: "real_call" }]) {
    const original = { model: "grok-cli/grok-4.7", input: [record] };
    assert.equal(normalizeContext(original).body, original);
  }
  for (const original of [null, [], "data", {model:"grok-cli/grok-4.7",input:"hi"}]) {
    assert.equal(normalizeContext(original).body, original);
  }
  assert.equal(isGrokModel("not-grok"), false);
});

test("preserves real tool pairs and all other request settings", () => {
  const call = { type:"function_call",call_id:"call_1",name:"get_time",arguments:"{}" };
  const output = { type:"function_call_output",call_id:"call_1",output:"10:00" };
  const original = { ...payload("grok-cli/grok-4.7"), tools:[{type:"function",name:"get_time"}],
    reasoning:{effort:"high"},store:false,parallel_tool_calls:true };
  original.input.push(call,output);
  const result = normalizeContext(original);
  assert.equal(result.body.input.at(-2),call); assert.equal(result.body.input.at(-1),output);
  for (const key of Object.keys(original).filter(k=>k!=="input")) assert.deepEqual(result.body[key],original[key]);
});

async function listen(server) {
  server.listen(0,"127.0.0.1"); await once(server,"listening");
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) {
  server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));
}
function send(base,body,{path="/v1/responses",headers={}}={}) {
  return new Promise((resolve,reject)=>{
    const url=new URL(path,base); const parts=[];
    const req=http.request(url,{method:"POST",headers:{"content-type":"application/json",
      "content-length":body.length,...headers}},res=>{
      res.on("data",p=>parts.push(p));res.on("end",()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(parts)}));
    });req.on("error",reject);req.end(body);
  });
}

test("HTTP forwarding preserves other models byte-for-byte, headers, errors and paths", async t => {
  let received;
  const upstream=http.createServer(async(req,res)=>{
    const parts=[];for await(const p of req)parts.push(p);
    received={body:Buffer.concat(parts),headers:req.headers,path:req.url};
    res.writeHead(422,{"content-type":"application/json","x-upstream-proof":"retained"});
    res.end('{"error":"test upstream error"}');
  });
  let bridge;
  try {
    const upstreamUrl=await listen(upstream);
    bridge=createBridge({upstream:upstreamUrl,logger:()=>{}});const bridgeUrl=await listen(bridge);
    for(const model of ["codex/gpt-6.1-sol","antigravity/gemini-3.8-flash-high","unrelated-priority-combo"]) {
      const raw=Buffer.from(JSON.stringify(payload(model),null,3)+"\n");
      const response=await send(bridgeUrl,raw,{path:"/v1/responses?test=1",headers:{authorization:"Bearer synthetic-test-only","x-omniroute-no-memory":"true"}});
      assert.deepEqual(received.body,raw);assert.equal(received.headers.authorization,"Bearer synthetic-test-only");
      assert.equal(received.headers["x-omniroute-no-memory"],"true");assert.equal(received.path,"/v1/responses?test=1");
      assert.equal(response.status,422);assert.equal(response.headers["x-upstream-proof"],"retained");
      assert.equal(response.body.toString(),'{"error":"test upstream error"}');
    }
    const gzip=zlib.gzipSync(Buffer.from(JSON.stringify(payload("grok-cli/grok-4.7"))));
    await send(bridgeUrl,gzip,{headers:{"content-encoding":"gzip"}});assert.deepEqual(received.body,gzip);
    const raw=Buffer.from(JSON.stringify(payload("grok-cli/grok-4.7")));
    await send(bridgeUrl,raw,{path:"/v1/responses/compact"});assert.deepEqual(received.body,raw);
    const health=await(await fetch(bridgeUrl+HEALTH_PATH)).json();assert.equal(health.id,BRIDGE_ID);
  } catch(error) {
    if (error?.cause?.code === "EACCES" || error?.code === "EACCES") return t.skip("Loopback socket connect restricted by local sandbox");
    throw error;
  } finally {
    if (bridge) await close(bridge);
    await close(upstream);
  }
});

test("targeted normalization recalculates length and preserves streaming SSE bytes",{timeout:10000},async t => {
  let received;let finalChunkSent=false;let finishStream;
  const first="event: response.created\ndata: {\"type\":\"response.created\"}\n\n";
  const last="event: response.completed\ndata: {\"type\":\"response.completed\"}\n\n";
  const upstream=http.createServer(async(req,res)=>{
    const parts=[];for await(const p of req)parts.push(p);
    received={body:Buffer.concat(parts),headers:req.headers};
    res.writeHead(200,{"content-type":"text/event-stream"});res.write(first);
    finishStream=()=>{finalChunkSent=true;res.end(last);};
  });
  let bridge;
  try {
    const upstreamUrl=await listen(upstream);
    bridge=createBridge({upstream:upstreamUrl,logger:()=>{}});
    const bridgeUrl=await listen(bridge);
    const raw=Buffer.from(JSON.stringify(payload("grok-cli/grok-4.7")));
    const response=await fetch(bridgeUrl+"/v1/responses",{method:"POST",headers:{"content-type":"application/json"},body:raw});
    const reader=response.body.getReader();const initial=await reader.read();
    assert.equal(finalChunkSent,false,"first SSE chunk must arrive before completion");
    finishStream();
    const chunks=[Buffer.from(initial.value)];for(;;){const p=await reader.read();if(p.done)break;chunks.push(Buffer.from(p.value));}
    assert.equal(Buffer.concat(chunks).toString(),first+last);
    assert.equal(Number(received.headers["content-length"]),received.body.length);
    const decoded=JSON.parse(received.body);assert.equal(decoded.input[1].type,"message");assert.equal(decoded.input[2].type,"message");
  } catch(error) {
    if (error?.cause?.code === "EACCES" || error?.code === "EACCES") return t.skip("Loopback socket connect restricted by local sandbox");
    throw error;
  } finally {
    if (bridge) await close(bridge);
    await close(upstream);
  }
});

test("oversized uploads use unchanged streaming fallback instead of a new rejection",async t => {
  let received;
  const upstream=http.createServer(async(req,res)=>{const parts=[];for await(const p of req)parts.push(p);received=Buffer.concat(parts);res.end("ok");});
  let bridge;
  try {
    const upstreamUrl=await listen(upstream);
    bridge=createBridge({upstream:upstreamUrl,maxBufferBytes:4,logger:()=>{}});
    const bridgeUrl=await listen(bridge);
    const raw=Buffer.from(JSON.stringify(payload("grok-cli/grok-4.7")));
    const response=await send(bridgeUrl,raw);assert.equal(response.status,200);assert.deepEqual(received,raw);
  } catch(error) {
    if (error?.cause?.code === "EACCES" || error?.code === "EACCES") return t.skip("Loopback socket connect restricted by local sandbox");
    throw error;
  } finally {
    if (bridge) await close(bridge);
    await close(upstream);
  }
});
