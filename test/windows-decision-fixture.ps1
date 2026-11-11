$ErrorActionPreference='Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'windows\Bridge-Decision.ps1')
function Assert-Decision($State,[string]$Expected,[string]$Code='',[string[]]$Aliases=@(),[bool]$Specified=$false){
  $actual=Get-BridgeAction -State ([pscustomobject]$State) -RequestedAliases $Aliases -AliasesWereSpecified $Specified
  if($actual.action -ne $Expected){throw "Expected $Expected but received $($actual.action)."}
  if($Code -and $actual.code -ne $Code){throw "Expected code $Code but received $($actual.code)."}
}
$healthy=@{taskInspectionUnavailable=$false;portConflict=$false;taskExists=$true;taskOwnedByProject=$true;taskRunning=$true;bridgeHealthy=$true;normalizationVersion=2;grokAliases=@('first');ready=$true}
Assert-Decision $healthy 'reuse'
Assert-Decision $healthy 'reuse' '' @('first') $true
Assert-Decision $healthy 'error' 'alias_conflict' @('different') $true
Assert-Decision $healthy 'error' 'alias_conflict' @('ALPHA') $true
$stopped=$healthy.Clone();$stopped.taskRunning=$false;$stopped.ready=$false
Assert-Decision $stopped 'start'
$waiting=$healthy.Clone();$waiting.bridgeHealthy=$false;$waiting.ready=$false
Assert-Decision $waiting 'wait'
$new=$healthy.Clone();$new.taskExists=$false;$new.taskRunning=$false;$new.bridgeHealthy=$false;$new.ready=$false
Assert-Decision $new 'install'
$foreign=$healthy.Clone();$foreign.taskOwnedByProject=$false
Assert-Decision $foreign 'error' 'ownership_conflict'
$port=$healthy.Clone();$port.portConflict=$true
Assert-Decision $port 'error' 'ownership_conflict'
$old=$healthy.Clone();$old.normalizationVersion=1;$old.taskRunning=$false;$old.ready=$false
Assert-Decision $old 'error' 'bridge_revision_old'
$denied=$healthy.Clone();$denied.taskInspectionUnavailable=$true
Assert-Decision $denied 'error' 'task_permission_required'
if(-not (Test-TransientNodePath 'C:\Program Files\WindowsApps\Example.Runtime\node.exe')){throw 'Versioned app runtime was not detected.'}
if(Test-TransientNodePath 'C:\Program Files\nodejs\node.exe'){throw 'Standalone Node.js was incorrectly rejected.'}
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
@{passed=13;mutationsPerformed=$false}|ConvertTo-Json -Compress
