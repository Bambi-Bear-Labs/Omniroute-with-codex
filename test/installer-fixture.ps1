param([Parameter(Mandatory=$true)][string]$SandboxRoot,[Parameter(Mandatory=$true)][string]$NodePath)
$ErrorActionPreference='Stop'
$install=Join-Path $SandboxRoot 'installed'
$installer=Join-Path $SandboxRoot 'windows\Install-Bridge.ps1'
$output=@(& $installer -InstallDirectory $install -TaskName 'Mocked-Test-Only' -NodePath $NodePath -GrokAliases 'sample-grok-combo')
if(-not (Test-Path -LiteralPath (Join-Path $SandboxRoot 'mock-task-created.txt')) -or -not (Test-Path -LiteralPath (Join-Path $SandboxRoot 'mock-task-started.txt'))){throw 'Mock task APIs did not run.'}
if(-not ($output -join "`n").Contains('SUCCESS:')){throw 'The installer did not report success.'}
$runtime=Get-Content -Raw -LiteralPath (Join-Path $install 'runtime.json') -Encoding UTF8|ConvertFrom-Json
if($runtime.node_executable -ne $NodePath -or @($runtime.grok_aliases)[0] -ne 'sample-grok-combo'){throw 'Runtime metadata did not preserve the selected path/alias.'}
if(-not (Test-Path -LiteralPath (Join-Path $install 'bridge.mjs'))){throw 'Bridge source was not copied.'}
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
@{status='passed';taskApiCallsMocked=$true;realTaskCreated=$false;codexConfigChanged=$false}|ConvertTo-Json -Compress
