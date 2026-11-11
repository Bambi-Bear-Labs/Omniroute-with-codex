import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('Windows task decisions reuse owned helpers and refuse unsafe changes',{skip:process.platform!=='win32'},()=>{
 const powershell=path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
 const result=spawnSync(powershell,['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'test/windows-decision-fixture.ps1')],{encoding:'utf8',windowsHide:true,timeout:30000});
 assert.equal(result.status,0,result.stderr);const report=JSON.parse(result.stdout.replace(/^\uFEFF/,'').trim());
 assert.equal(report.passed,13);assert.equal(report.mutationsPerformed,false);
});
