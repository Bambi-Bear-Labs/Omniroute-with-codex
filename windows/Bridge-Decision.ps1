function Get-BridgeAction {
  param([Parameter(Mandatory=$true)]$State,[string[]]$RequestedAliases,[bool]$AliasesWereSpecified=$false)
  if($State.taskInspectionUnavailable){return @{action='error';code='task_permission_required';message='Windows task inspection is unavailable.'}}
  if($State.portConflict){return @{action='error';code='ownership_conflict';message='Port 20129 is owned by another service or directory.'}}
  if($State.taskExists -and -not $State.taskOwnedByProject){return @{action='error';code='ownership_conflict';message='The task does not belong to this helper.'}}
  if($State.bridgeHealthy -and $State.normalizationVersion -lt 2){return @{action='error';code='bridge_revision_old';message='The running worker requires a reviewed update before changing routing.'}}
  if($AliasesWereSpecified -and $State.taskExists){
    $wanted=@((@($RequestedAliases) -join ',').Split(',')|ForEach-Object {$_.Trim()}|Where-Object {$_}|Sort-Object -CaseSensitive -Unique)
    $current=@((@($State.grokAliases) -join ',').Split(',')|ForEach-Object {$_.Trim()}|Where-Object {$_}|Sort-Object -CaseSensitive -Unique)
    if(($wanted -join ',') -cne ($current -join ',')){return @{action='error';code='alias_conflict';message='Existing aliases differ; use a reviewed repair rather than overwriting runtime settings.'}}
  }
  if(-not $State.taskExists){return @{action='install'}}
  if(-not $State.taskRunning){return @{action='start'}}
  if($State.ready){return @{action='reuse'}}
  return @{action='wait'}
}

function Test-TransientNodePath {
  param([Parameter(Mandatory=$true)][string]$NodePath)
  return $NodePath -match '(?i)[\\/]WindowsApps[\\/]|#!sandbox'
}
