import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const isWindows=process.platform==='win32';
const mocks=String.raw`$script:mock=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'mock-state.json') -Encoding UTF8|ConvertFrom-Json
function Get-MockTask { [CmdletBinding()]param($TaskName) return [pscustomobject]@{Actions=@([pscustomobject]@{Arguments=('-File "'+(Join-Path $InstallDirectory 'Run-Bridge-Managed.ps1')+'"')})} }
function Stop-MockTask {param($TaskName) [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'stop-task.txt'),'yes')}
function Unregister-MockTask { [CmdletBinding(SupportsShouldProcess=$true)]param($TaskName) [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'unregister-task.txt'),'yes')}
function Get-MockProcess { [CmdletBinding()]param($Id) return [pscustomobject]@{ProcessName='node'} }
function Stop-MockProcess {param($Id) [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'stop-worker.txt'),'yes')}
`;
function fixture(state,callback){
 const tempDir=path.join(root,'.tmp-test-homes'); fs.mkdirSync(tempDir,{recursive:true}); const temp=fs.realpathSync(tempDir); fs.mkdirSync(temp,{recursive:true});const dir=fs.mkdtempSync(path.join(temp,'omniroute-codex-uninstall-test-'));let timedOut=false;
 try{
  let script=fs.readFileSync(path.join(root,'windows','Uninstall-Bridge.ps1'),'utf8');
  for(const [actual,mock] of [['Unregister-ScheduledTask','Unregister-MockTask'],['Stop-ScheduledTask','Stop-MockTask'],['Get-ScheduledTask','Get-MockTask'],['Get-Process','Get-MockProcess'],['Stop-Process','Stop-MockProcess']])script=script.replaceAll(actual,mock);
  assert.ok(script.includes("$ErrorActionPreference='Stop'"));
  script=script.replace("$ErrorActionPreference='Stop'","$ErrorActionPreference='Stop'\n"+mocks);
  assert.doesNotMatch(script,/\b(?:Get|Stop|Unregister)-ScheduledTask|\b(?:Get|Stop)-Process/);
  fs.writeFileSync(path.join(dir,'Uninstall-Bridge.ps1'),script);
  fs.writeFileSync(path.join(dir,'mock-state.json'),JSON.stringify(state));
  fs.writeFileSync(path.join(dir,'Bridge-Common.ps1'),"function Read-BridgeHealth { if($script:mock.health){return @{id='codex-grok-context-bridge-v1';directory=[IO.Path]::GetFullPath($InstallDirectory);pid=1234}};return $null }\n");
  fs.writeFileSync(path.join(dir,'Inspect-Bridge.ps1'),"param($InstallDirectory,$TaskName)\nGet-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'mock-state.json') -Encoding UTF8\n");
  const exe=path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
  const r=spawnSync(exe,['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(dir,'Uninstall-Bridge.ps1'),'-InstallDirectory',path.join(dir,'installed'),'-TaskName','Mocked-Uninstall-Only'],{encoding:'utf8',windowsHide:true,timeout:20000});
  timedOut=r.error?.code==='ETIMEDOUT';return callback({dir,result:r});
 }finally{
  if(!timedOut){const resolved=fs.realpathSync(dir);assert.equal(path.dirname(resolved),temp);assert.ok(path.basename(resolved).startsWith('omniroute-codex-uninstall-test-'));fs.rmSync(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
 }
}

test('Windows uninstaller unregisters an owned stopped task without an unnecessary stop',{skip:!isWindows,timeout:30000},()=>fixture({taskInspectionUnavailable:false,taskExists:true,taskOwnedByProject:true,taskRunning:false,health:false},({dir,result})=>{
 assert.equal(result.status,0,result.stderr+'\n'+result.stdout);assert.equal(fs.existsSync(path.join(dir,'unregister-task.txt')),true);assert.equal(fs.existsSync(path.join(dir,'stop-task.txt')),false);assert.equal(fs.existsSync(path.join(dir,'stop-worker.txt')),false);
}));

test('Windows uninstaller only stops the known matching worker for an owned running task',{skip:!isWindows,timeout:30000},()=>fixture({taskInspectionUnavailable:false,taskExists:true,taskOwnedByProject:true,taskRunning:true,health:true},({dir,result})=>{
 assert.equal(result.status,0,result.stderr+'\n'+result.stdout);for(const name of ['unregister-task.txt','stop-task.txt','stop-worker.txt'])assert.equal(fs.existsSync(path.join(dir,name)),true,name);
}));

test('Windows uninstaller rejects an unowned task before any removal',{skip:!isWindows,timeout:30000},()=>fixture({taskInspectionUnavailable:false,taskExists:true,taskOwnedByProject:false,taskRunning:true,health:true},({dir,result})=>{
 assert.notEqual(result.status,0);for(const name of ['unregister-task.txt','stop-task.txt','stop-worker.txt'])assert.equal(fs.existsSync(path.join(dir,name)),false,name);
}));
