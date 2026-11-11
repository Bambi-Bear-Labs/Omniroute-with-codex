import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mocks=String.raw`$script:mockTask=$false;$script:mockReady=$false;$script:expectedInstall=$InstallDirectory
function Get-MockTask {param($TaskName) if($script:mockTask){return [pscustomobject]@{State='Running'}}}
function New-MockTaskAction {param($Execute,$Argument,$WorkingDirectory) return @{execute=$Execute;arguments=$Argument;directory=$WorkingDirectory}}
function New-MockTaskTrigger {param([switch]$AtLogOn,$User) if(-not $AtLogOn){throw 'Expected sign-in trigger.'};return @{trigger='logon'}}
function New-MockTaskPrincipal {param($UserId,$LogonType,$RunLevel) if($LogonType -ne 'Interactive' -or $RunLevel -ne 'Limited'){throw 'Unexpected principal.'};return @{user='synthetic'}}
function New-MockTaskSettingsSet {
 param([switch]$AllowStartIfOnBatteries,[switch]$DontStopIfGoingOnBatteries,[switch]$StartWhenAvailable,[TimeSpan]$ExecutionTimeLimit,[int]$RestartCount,[TimeSpan]$RestartInterval,$MultipleInstances,[switch]$Hidden)
 if(-not $AllowStartIfOnBatteries -or -not $DontStopIfGoingOnBatteries -or -not $StartWhenAvailable -or $ExecutionTimeLimit -ne [TimeSpan]::Zero -or $RestartCount -lt 1 -or $MultipleInstances -ne 'IgnoreNew'){throw 'Unexpected task safety settings.'}
 return @{settings='verified'}
}
function New-MockTask {param($Action,$Trigger,$Principal,$Settings,$Description) return @{action=$Action;trigger=$Trigger;principal=$Principal;settings=$Settings}}
function Register-MockTask {param($TaskName,$InputObject) $script:mockTask=$true;[IO.File]::WriteAllText((Join-Path $script:repoRoot 'mock-task-created.txt'),'yes');return @{registered=$true}}
function Start-MockTask {param($TaskName) $script:mockReady=$true;[IO.File]::WriteAllText((Join-Path $script:repoRoot 'mock-task-started.txt'),'yes')}
`;
test('Windows installer completes against mocked task APIs without touching live settings',{skip:process.platform!=='win32',timeout:45000},()=>{
 const tempDir=path.join(root,'.tmp-test-homes'); fs.mkdirSync(tempDir,{recursive:true}); const temp=fs.realpathSync(tempDir); fs.mkdirSync(temp,{recursive:true});const dir=fs.mkdtempSync(path.join(temp,'omniroute-codex-installer-test-'));let timedOut=false;
 try{
  for(const name of ['src','windows','test'])fs.mkdirSync(path.join(dir,name));
  for(const name of ['bridge.mjs','normalize.mjs'])fs.copyFileSync(path.join(root,'src',name),path.join(dir,'src',name));
  for(const name of ['Bridge-Decision.ps1','Run-Bridge-Managed.ps1','Start-Bridge.ps1','Stop-Bridge.ps1'])fs.copyFileSync(path.join(root,'windows',name),path.join(dir,'windows',name));
  let installer=fs.readFileSync(path.join(root,'windows','Install-Bridge.ps1'),'utf8');
  const replacements=[['New-ScheduledTaskSettingsSet','New-MockTaskSettingsSet'],['New-ScheduledTaskPrincipal','New-MockTaskPrincipal'],['New-ScheduledTaskTrigger','New-MockTaskTrigger'],['New-ScheduledTaskAction','New-MockTaskAction'],['Register-ScheduledTask','Register-MockTask'],['Start-ScheduledTask','Start-MockTask'],['Get-ScheduledTask','Get-MockTask'],['New-ScheduledTask','New-MockTask']];
  for(const [actual,mock] of replacements)installer=installer.replaceAll(actual,mock);
  assert.ok(installer.includes('Import-Module ScheduledTasks -ErrorAction Stop'));
  installer=installer.replace('Import-Module ScheduledTasks -ErrorAction Stop',mocks);
  assert.doesNotMatch(installer,/\b(?:Get|New|Register|Start|Stop|Unregister)-ScheduledTask/);
  fs.writeFileSync(path.join(dir,'windows','Install-Bridge.ps1'),installer);
  fs.writeFileSync(path.join(dir,'windows','Bridge-Common.ps1'),"function Read-BridgeHealth { if($script:mockReady){return @{id='codex-grok-context-bridge-v1';directory=$script:expectedInstall;normalizationVersion=2;pid=1234}};return $null }\n");
  fs.writeFileSync(path.join(dir,'test','minimal.test.mjs'),"import test from 'node:test'; test('synthetic',()=>{});\n");
  const exe=path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
  const result=spawnSync(exe,['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'test','installer-fixture.ps1'),'-SandboxRoot',dir,'-NodePath',process.execPath],{encoding:'utf8',windowsHide:true,timeout:35000});
  timedOut=result.error?.code==='ETIMEDOUT';
  assert.equal(result.status,0,result.stderr+'\n'+result.stdout);
  const report=JSON.parse(result.stdout.replace(/^\uFEFF/,'').trim());
  assert.equal(report.status,'passed');assert.equal(report.taskApiCallsMocked,true);assert.equal(report.realTaskCreated,false);assert.equal(report.codexConfigChanged,false);
 }finally{
  if(!timedOut){const resolved=fs.realpathSync(dir);assert.equal(path.dirname(resolved),temp);assert.ok(path.basename(resolved).startsWith('omniroute-codex-installer-test-'));fs.rmSync(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
 }
});
