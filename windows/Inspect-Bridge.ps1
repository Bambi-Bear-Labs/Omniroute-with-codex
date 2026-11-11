[CmdletBinding()]
param(
  [string]$InstallDirectory=(Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'CodexGrokBridge'),
  [string]$TaskName=('Codex Grok Bridge - '+$env:USERNAME)
)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'Bridge-Common.ps1')
$InstallDirectory=[IO.Path]::GetFullPath($InstallDirectory)
$task=$null;$inspectionError=$false
try {
  $matches=@(Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop)
  if($matches.Count -eq 1){$task=$matches[0]}else{$inspectionError=$true}
} catch {
  if($_.FullyQualifiedErrorId -notlike 'CmdletizationQuery_NotFound_TaskName*'){$inspectionError=$true}
}
$owned=$false
if($task -and @($task.Actions).Count -eq 1){
  $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
  $user=[string]$task.Principal.UserId
  $sameUser=$user -eq $identity.User.Value -or $user -ieq $identity.Name
  if(-not $sameUser -and -not $user.Contains('\')){$sameUser=$identity.Name.EndsWith('\'+$user,[StringComparison]::OrdinalIgnoreCase)}
  $worker=Join-Path $InstallDirectory 'Run-Bridge-Managed.ps1'
  $expectedArgs='-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$worker+'"'
  $expectedExe=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $action=$task.Actions[0]
  $owned=$sameUser -and $task.TaskPath -eq '\' -and
    [string]::Equals([string]$action.Execute,$expectedExe,[StringComparison]::OrdinalIgnoreCase) -and
    [string]::Equals([string]$action.Arguments,$expectedArgs,[StringComparison]::OrdinalIgnoreCase) -and
    [string]::Equals([string]$action.WorkingDirectory,$InstallDirectory,[StringComparison]::OrdinalIgnoreCase)
}
$health=Read-BridgeHealth
$matching=$health -and $health.id -eq 'codex-grok-context-bridge-v1' -and $health.directory -eq $InstallDirectory
$portInUse=[bool]$matching
if(-not $portInUse){
  $client=[Net.Sockets.TcpClient]::new()
  try{$portInUse=$client.ConnectAsync('127.0.0.1',20129).Wait(500) -and $client.Connected}catch{}finally{$client.Dispose()}
}
$runtimePath=Join-Path $InstallDirectory 'runtime.json'
$runtime=$null
if(Test-Path -LiteralPath $runtimePath){try{$runtime=Get-Content -Raw -LiteralPath $runtimePath|ConvertFrom-Json}catch{}}
$aliasInventoryKnown=[bool]($runtime -and ($runtime.PSObject.Properties.Name -contains 'grok_aliases'))
[ordered]@{
  schemaVersion=1;installDirectory=$InstallDirectory;taskName=$TaskName
  portConflict=($portInUse -and -not $matching);taskExists=[bool]$task
  taskOwnedByProject=[bool]$owned;taskRunning=([bool]$task -and [string]$task.State -eq 'Running')
  taskInspectionUnavailable=$inspectionError;bridgeHealthy=[bool]$matching
  normalizationVersion=$(if($matching){$health.normalizationVersion}else{$null})
  grokAliases=@($runtime.grok_aliases|Where-Object {$_});runtimeMetadataAvailable=[bool]$runtime;aliasInventoryKnown=$aliasInventoryKnown
  ready=([bool]$owned -and [string]$task.State -eq 'Running' -and $matching -and $health.normalizationVersion -ge 2)
  mutationsPerformed=$false
}|ConvertTo-Json -Depth 5 -Compress
