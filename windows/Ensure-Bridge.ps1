[CmdletBinding()]
param([string[]]$GrokAliases)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'Bridge-Decision.ps1')
$action='none'
try {
  $before=(& (Join-Path $PSScriptRoot 'Inspect-Bridge.ps1'))|ConvertFrom-Json
  $decision=Get-BridgeAction -State $before -RequestedAliases $GrokAliases -AliasesWereSpecified ($PSBoundParameters.ContainsKey('GrokAliases'))
  if($decision.action -eq 'error'){throw ($decision.code+': '+$decision.message)}
  $action='reused'
  if($decision.action -eq 'install'){
    $action='installation_attempted'
    $arguments=@{}
    if($PSBoundParameters.ContainsKey('GrokAliases')){$arguments.GrokAliases=$GrokAliases}
    $captured=& (Join-Path $PSScriptRoot 'Install-Bridge.ps1') @arguments 6>&1
    $action='installed'
  } elseif($decision.action -eq 'start'){
    $action='start_attempted'
    Start-ScheduledTask -TaskName $before.taskName
    $action='started_existing_task'
  }
  $watch=[Diagnostics.Stopwatch]::StartNew();$after=$null
  while($watch.Elapsed.TotalSeconds -lt 25){
    $after=(& (Join-Path $PSScriptRoot 'Inspect-Bridge.ps1'))|ConvertFrom-Json
    if($after.ready){break}
    if($after.bridgeHealthy -and $after.normalizationVersion -lt 2){throw 'bridge_revision_old: The running worker requires a reviewed update before changing Codex routing.'}
    Start-Sleep -Milliseconds 300
  }
  if(-not $after.ready){throw 'task_setup_failed: The supervised bridge did not become ready. Codex configuration was not changed.'}
  [ordered]@{schemaVersion=1;status='ready';action=$action;installDirectory=$after.installDirectory;taskName=$after.taskName;normalizationVersion=$after.normalizationVersion;codexConfigModified=$false;apiKeyWritten=$false;omnirouteModified=$false}|ConvertTo-Json -Depth 4 -Compress
} catch {
  $message=$_.Exception.Message;$code='task_setup_failed'
  if($message -match '^([a-z_]+): (.+)$'){$code=$matches[1];$message=$matches[2]}
  [ordered]@{schemaVersion=1;status='error';code=$code;message=$message;requiresUserAction=$true;effects=@{bridgeAction=$action;configuration='not applied'}}|ConvertTo-Json -Depth 4 -Compress
  exit 2
}
