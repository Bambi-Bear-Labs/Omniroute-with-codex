import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function markdownFiles(folder) {
  const result = [];
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(entry.name)) continue;
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) result.push(...markdownFiles(full));
    else if (entry.name.endsWith('.md')) result.push(full);
  }
  return result;
}

test('relative documentation and illustration links resolve', () => {
  for (const file of markdownFiles(root)) {
    const text = fs.readFileSync(file, 'utf8');
    const targets = [
      ...Array.from(text.matchAll(/\]\(([^)]+)\)/g), m => m[1]),
      ...Array.from(text.matchAll(/src="([^"]+)"/g), m => m[1])
    ];
    for (const target of targets) {
      if (/^(?:https?:|mailto:|#)/.test(target)) continue;
      const relative = target.split('#')[0];
      if (!relative) continue;
      assert.ok(fs.existsSync(path.resolve(path.dirname(file), relative)),
        `${path.relative(root, file)}: missing ${relative}`);
    }
  }
});

test('example catalog has unique routes and ordered priorities', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'examples', 'omniroute-models.example.json'), 'utf8'));
  assert.equal(new Set(catalog.models.map(m => m.slug)).size, catalog.models.length);
  assert.deepEqual(catalog.models.map(m => m.priority), catalog.models.map((_, i) => i));
});

test('README points beginners to setup and clearly states the gateway dependency', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.ok(readme.includes('docs/user-guide.md'));
  assert.ok(readme.includes('## Quick start'));
  assert.ok(readme.includes('Only the bridge is automated here.'));
  assert.ok(readme.includes('does not install or launch that server'));
});

test('AI install manifest matches executable entry points and the package version',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'install-manifest.json'),'utf8'));
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  assert.equal(manifest.schemaVersion,1);assert.equal(manifest.version,pkg.version);
  assert.equal(manifest.agentInstructions,'AGENTS.md');
  for(const command of Object.values(manifest.commands)){
    assert.equal(command[0],'node');assert.ok(fs.existsSync(path.join(root,command[1])));
  }
  assert.equal(manifest.safety.apiKeyAsArgumentSupported,false);
  assert.equal(manifest.safety.fullRebootVerifiedByInstaller,false);
});

test('key installation-guide section anchors exist',()=>{
 const checks=[
  ['README.md',['quick-start','key-features','how-it-works','documentation','troubleshooting']],
  ['docs/setup-windows.md',['reboot-acceptance-checklist']],
  ['docs/configuration.md',['api-key','optional-model-catalog','custom-combo-aliases']],
  ['docs/ai-install.md',['phase-1-inspect','phase-2-plan-with-no-changes','phase-3-apply-within-the-authorized-scope','phase-4-verify-the-real-workflow']]
 ];
 for(const [file,expected] of checks){
  const text=fs.readFileSync(path.join(root,file),'utf8');
  const slugs=Array.from(text.matchAll(/^#{1,6}\s+(.+)$/gm),m=>m[1].trim().toLowerCase().replace(/[^\p{L}\p{N}_ -]/gu,'').replaceAll(' ','-'));
  for(const slug of expected)assert.ok(slugs.includes(slug),`${file}: missing #${slug}`);
 }
});

test('the committed bridge retains the Grok continuation fix',async()=>{
 const {NORMALIZATION_VERSION,normalizeContext}=await import('../src/normalize.mjs');
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'install-manifest.json'),'utf8'));
 assert.ok(NORMALIZATION_VERSION>=manifest.minimumNormalizationVersion);
 const result=normalizeContext({model:'grok-cli/grok-4.7',input:[{type:'web_search_call',status:'completed',action:{type:'other'}}]});
 assert.equal(result.count,1);assert.equal(result.body.input[0].type,'message');
});

test('multiple AI agent entry points lead to the guarded install guide',()=>{
 for(const name of ['AGENTS.md','CLAUDE.md','GEMINI.md','.github/copilot-instructions.md','llms.txt']){
  const text=fs.readFileSync(path.join(root,name),'utf8');
  assert.ok(text.includes('docs/ai-install.md'),`${name} does not point to the AI installation guide`);
 }
});
