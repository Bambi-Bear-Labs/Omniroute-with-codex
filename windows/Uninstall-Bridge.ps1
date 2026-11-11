[CmdletBinding(SupportsShouldProcess=$true)]
param(
 [string]$InstallDirectory=(Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'CodexGrokBridge'),
 [string]$TaskName=('Codex Grok Bridge - '+$env:USERNAME)
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Bridge-Common.ps1')
$InstallDirectory=[IO.Path]::GetFullPath($InstallDirectory)
if($WhatIfPreference){Write-Output "Would remove only task '$TaskName' and stop its known bridge. Config and files remain.";return}
$inspection=(& (Join-Path $PSScriptRoot 'Inspect-Bridge.ps1') -InstallDirectory $InstallDirectory -TaskName $TaskName)|ConvertFrom-Json
if($inspection.taskInspectionUnavailable){throw 'Task ownership could not be verified; nothing was stopped.'}
if($inspection.taskExists -and -not $inspection.taskOwnedByProject){throw 'Task identity does not match this helper/current user; nothing was stopped.'}
$task=Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if(-not $task){Write-Output 'Task is already absent; nothing was stopped or deleted.';return}
$expected=Join-Path $InstallDirectory 'Run-Bridge-Managed.ps1'
if(@($task.Actions).Count -ne 1 -or -not $task.Actions[0].Arguments.Contains('"'+$expected+'"')){throw 'Task action does not match this helper; refusing to remove it.'}
$health=Read-BridgeHealth;$knownPid=$null
if($health -and $health.id -eq 'codex-grok-context-bridge-v1' -and $health.directory -eq $InstallDirectory){$knownPid=$health.pid}
if($PSCmdlet.ShouldProcess($TaskName,'Stop and unregister only this bridge task')){
 if($inspection.taskRunning){Stop-ScheduledTask -TaskName $TaskName}
 Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
 if($knownPid){
  $still=Read-BridgeHealth
  if($still -and $still.pid -eq $knownPid -and $still.directory -eq $InstallDirectory){
   $process=Get-Process -Id $knownPid -ErrorAction SilentlyContinue
   if($process -and $process.ProcessName -eq 'node'){Stop-Process -Id $knownPid}
  }
 }
 Write-Output 'Only the bridge task/known worker were removed. Files, Codex config, model catalog, API keys and OmniRoute are untouched.'
}
