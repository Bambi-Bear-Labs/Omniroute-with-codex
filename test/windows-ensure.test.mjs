import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const isWindows=process.platform==='win32';
const healthy={taskInspectionUnavailable:false,portConflict:false,taskExists:true,taskOwnedByProject:true,taskRunning:true,bridgeHealthy:true,normalizationVersion:2,grokAliases:['alpha'],ready:true,installDirectory:'synthetic-dir',taskName:'synthetic-task'};
function fixture(state,callback){
 const temp=fs.realpathSync(os.tmpdir());const dir=fs.mkdtempSync(path.join(temp,'omniroute-codex-ensure-test-'));
 try{
  fs.copyFileSync(path.join(root,'windows','Bridge-Decision.ps1'),path.join(dir,'Bridge-Decision.ps1'));
  let ensure=fs.readFileSync(path.join(root,'windows','Ensure-Bridge.ps1'),'utf8');
  const realStart='Start-ScheduledTask -TaskName $before.taskName';
  assert.ok(ensure.includes(realStart));
  ensure=ensure.replaceAll(realStart,"throw 'Task start is not simulated in this fixture.'");
  assert.doesNotMatch(ensure,/\bStart-ScheduledTask\b/);
  fs.writeFileSync(path.join(dir,'Ensure-Bridge.ps1'),ensure);
  fs.writeFileSync(path.join(dir,'mock-state.json'),JSON.stringify(state));
  fs.writeFileSync(path.join(dir,'Inspect-Bridge.ps1'),"Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'mock-state.json') -Encoding UTF8\n");
  fs.writeFileSync(path.join(dir,'Install-Bridge.ps1'),String.raw`param([string[]]$GrokAliases)
$path=Join-Path $PSScriptRoot 'mock-state.json'
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'installer-called'),'yes')
$s=Get-Content -Raw -LiteralPath $path -Encoding UTF8|ConvertFrom-Json
if($s.mockInstallerFailure){throw 'Synthetic install failure.'}
$s.taskExists=$true;$s.taskOwnedByProject=$true;$s.taskRunning=$true;$s.bridgeHealthy=$true;$s.normalizationVersion=2;$s.ready=$true
$s|ConvertTo-Json -Compress|Set-Content -LiteralPath $path -Encoding UTF8
`);
  const powershell=path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
  const run=(args=[])=>{
   const r=spawnSync(powershell,['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(dir,'Ensure-Bridge.ps1'),...args],{encoding:'utf8',windowsHide:true,timeout:30000});
   return {exit:r.status,stderr:r.stderr,json:JSON.parse(r.stdout.replace(/^\uFEFF/,'').trim())};
  };
  return callback({dir,run});
 }finally{
  const resolved=fs.realpathSync(dir);assert.equal(path.dirname(resolved),temp);assert.ok(path.basename(resolved).startsWith('omniroute-codex-ensure-test-'));fs.rmSync(resolved,{recursive:true,force:true});
 }
}

test('Windows ensure reuses healthy bridge and rejects alias conflicts without writes',{skip:!isWindows},()=>fixture(healthy,({dir,run})=>{
 const ok=run();assert.equal(ok.exit,0,ok.stderr);assert.equal(ok.json.action,'reused');assert.equal(fs.existsSync(path.join(dir,'installer-called')),false);
 const conflict=run(['-GrokAliases','beta']);assert.equal(conflict.exit,2);assert.equal(conflict.json.code,'alias_conflict');assert.equal(conflict.json.effects.bridgeAction,'none');assert.equal(fs.existsSync(path.join(dir,'installer-called')),false);
}));

test('Windows ensure can install a missing bridge using a fully mocked installer',{skip:!isWindows},()=>fixture({...healthy,taskExists:false,taskRunning:false,bridgeHealthy:false,normalizationVersion:null,ready:false,grokAliases:[]},({dir,run})=>{
 const result=run();assert.equal(result.exit,0,result.stderr);assert.equal(result.json.action,'installed');assert.equal(fs.readFileSync(path.join(dir,'installer-called'),'utf8'),'yes');
}));

test('Windows ensure reports a partially attempted install without claiming no side effects',{skip:!isWindows},()=>fixture({...healthy,taskExists:false,taskRunning:false,bridgeHealthy:false,ready:false,mockInstallerFailure:true},({dir,run})=>{
 const result=run();assert.equal(result.exit,2);assert.equal(result.json.status,'error');assert.equal(result.json.effects.bridgeAction,'installation_attempted');assert.equal(result.json.effects.configuration,'not applied');assert.equal(fs.existsSync(path.join(dir,'installer-called')),true);
}));

test('Windows ensure rejects outdated or foreign workers before installation',{skip:!isWindows},()=>{
 for(const extra of [{normalizationVersion:1,ready:false},{portConflict:true}])fixture({...healthy,...extra},({dir,run})=>{
  const result=run();assert.equal(result.exit,2);assert.ok(['bridge_revision_old','ownership_conflict'].includes(result.json.code));assert.equal(fs.existsSync(path.join(dir,'installer-called')),false);
 });
});
