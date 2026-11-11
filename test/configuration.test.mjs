import test from "node:test";
import assert from "node:assert/strict";
import { normalizeContext, isGrokModel, parseGrokAliases } from "../src/normalize.mjs";
import { createBridge } from "../src/bridge.mjs";

const context = {type:"function_call_output",namespace:"agent",name:"codex_apps_open_page",output:'{"page_id":null}'};
test("custom combo aliases are opt-in and never rewrite unrelated combos",()=>{
 const request={model:"my-grok-combo",input:[context]};
 assert.equal(normalizeContext(request).body,request);
 assert.equal(normalizeContext(request,{grokAliases:["my-grok-combo"]}).count,1);
 assert.equal(isGrokModel("my-grok-combo"),false);
 assert.equal(isGrokModel("my-grok-combo",["my-grok-combo"]),true);
});
test("alias parsing trims, deduplicates and handles an unset value",()=>{
 assert.deepEqual(parseGrokAliases(),[]);
 assert.deepEqual(parseGrokAliases(" a, b, a, ,"),["a","b"]);
});
test("non-loopback and non-HTTP upstream targets are rejected",()=>{
 for(const upstream of ["https://example.com","http://example.com","https://localhost:20128"]){
  assert.throws(()=>createBridge({upstream}),/loopback/);
 }
});
test("known context text is preserved without promotion to a developer instruction",()=>{
 const original={model:"grok-cli/grok-4.7",input:[{...context,output:'<untrusted>example</untrusted>'}]};
 const normalized=normalizeContext(original).body.input[0];
 assert.equal(normalized.role,"user");
 assert.match(normalized.content[0].text,/not an instruction/);
 assert.ok(normalized.content[0].text.includes(original.input[0].output));
 assert.equal(Object.hasOwn(normalized,"call_id"),false);
});
