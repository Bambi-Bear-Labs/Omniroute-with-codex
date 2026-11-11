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
