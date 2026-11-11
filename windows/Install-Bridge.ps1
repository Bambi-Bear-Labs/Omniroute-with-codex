[CmdletBinding(SupportsShouldProcess=$true)]
param(
    [string]$InstallDirectory=(Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'CodexGrokBridge'),
    [string]$TaskName=('Codex Grok Bridge - '+$env:USERNAME),
    [string]$NodePath,
    [string[]]$GrokAliases = @()
)
$ErrorActionPreference='Stop'
$kitRoot=Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot=Split-Path -Parent $kitRoot
$payload=$kitRoot
. (Join-Path $payload 'Bridge-Common.ps1')
$InstallDirectory=[System.IO.Path]::GetFullPath($InstallDirectory)
if(-not $NodePath){$NodePath=(Get-Command node.exe -ErrorAction Stop).Source}
if(-not(Test-Path -LiteralPath $NodePath)){throw 'Install Node.js before installing the bridge.'}
$NodePath=(Get-Item -LiteralPath $NodePath).FullName
$identity=[System.Security.Principal.WindowsIdentity]::GetCurrent()
$plan=[ordered]@{install_directory=$InstallDirectory;task_name=$TaskName;user=$identity.Name;node_executable=$NodePath;trigger='At user sign-in; no delay';codex_config_modified=$false;omniroute_started_or_modified=$false}
if($WhatIfPreference){$plan|ConvertTo-Json;return}
if($InstallDirectory -match '#!sandbox'){throw 'Run the installer from a normal Windows terminal, not an app sandbox.'}
Import-Module ScheduledTasks -ErrorAction Stop
if(Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue){throw 'Task already exists. For a Codex-only reinstall, reuse the healthy bridge. Do not create duplicates. See the SOP before a full repair.'}
$health=Read-BridgeHealth
if($health -and ($health.id -ne 'codex-grok-context-bridge-v1' -or $health.directory -ne $InstallDirectory)){throw 'Port 20129 belongs to another instance/service. Nothing was stopped.'}
if(-not $PSCmdlet.ShouldProcess($InstallDirectory,'Install bridge and current-user sign-in task')){return}
New-Item -ItemType Directory -Force -Path $InstallDirectory|Out-Null
$files=@('bridge.mjs','normalize.mjs','Run-Bridge-Managed.ps1','Start-Bridge.ps1','Stop-Bridge.ps1','Bridge-Common.ps1')
$backup=Join-Path $InstallDirectory ('backups\'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
foreach($name in $files){
    $destination=Join-Path $InstallDirectory $name
    if(Test-Path -LiteralPath $destination){
        New-Item -ItemType Directory -Force -Path $backup|Out-Null
        Copy-Item -LiteralPath $destination -Destination (Join-Path $backup $name)
    }
    $origin=Join-Path $payload $name
    if($name -in @('bridge.mjs','normalize.mjs')){$origin=Join-Path (Join-Path $repoRoot 'src') $name}
    Copy-Item -LiteralPath $origin -Destination $destination
}
[ordered]@{node_executable=$NodePath;task_name=$TaskName;grok_aliases=@($GrokAliases)}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $InstallDirectory 'runtime.json') -Encoding UTF8
$testFiles=@(Get-ChildItem -LiteralPath (Join-Path $repoRoot 'test') -Filter '*.test.mjs' -File | ForEach-Object {$_.FullName})
& $NodePath --test @testFiles
if($LASTEXITCODE -ne 0){throw 'Regression tests failed; no task was created.'}
$worker=Join-Path $InstallDirectory 'Run-Bridge-Managed.ps1'
$powerShell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$action=New-ScheduledTaskAction -Execute $powerShell -Argument ('-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$worker+'"') -WorkingDirectory $InstallDirectory
$trigger=New-ScheduledTaskTrigger -AtLogOn -User $identity.User.Value
$principal=New-ScheduledTaskPrincipal -UserId $identity.User.Value -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -Hidden
$task=New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Local Codex Grok bridge: per-user sign-in and automatic recovery; no saved credentials.'
$null=Register-ScheduledTask -TaskName $TaskName -InputObject $task
Start-ScheduledTask -TaskName $TaskName
$timer=[Diagnostics.Stopwatch]::StartNew();$health=$null
while($timer.Elapsed.TotalSeconds -lt 25){
    $health=Read-BridgeHealth
    if($health -and $health.id -eq 'codex-grok-context-bridge-v1' -and $health.directory -eq $InstallDirectory){break}
    Start-Sleep -Milliseconds 200
}
if(-not $health -or $health.id -ne 'codex-grok-context-bridge-v1' -or $health.directory -ne $InstallDirectory){throw 'Task installed but bridge identity/health is incorrect. Do not change Codex URL yet; inspect logs.'}
if((Get-ScheduledTask -TaskName $TaskName).State -ne 'Running'){throw 'The supervisor did not remain running.'}
[ordered]@{installed_at=(Get-Date -Format o);install_directory=$InstallDirectory;task_name=$TaskName;user=$identity.Name;node_executable=$NodePath;bridge_pid=$health.pid}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $InstallDirectory 'installation.json') -Encoding UTF8
Write-Output 'SUCCESS: automatic bridge startup is installed and running.'
Write-Output 'Codex config, model catalog, API key, provider accounts, and OmniRoute settings were NOT changed.'
Write-Output 'Complete docs/setup-windows.md, validate the connection, then perform the reboot acceptance check.'
