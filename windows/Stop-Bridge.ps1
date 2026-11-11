$ErrorActionPreference = 'Stop'
$bridgeRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$statePath = Join-Path $bridgeRoot 'bridge-state.json'
if (-not (Test-Path -LiteralPath $statePath)) { Write-Output 'No bridge state file found.'; exit 0 }
$state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
$healthUrl = 'http://127.0.0.1:20129/__codex_grok_bridge_health'
function Read-BridgeHealth {
    $response = $null
    $reader = $null
    try {
        # Works in Windows PowerShell 5.1 and PowerShell 7; bypass proxies only
        # for this fixed loopback request. No global proxy setting is changed.
        $request = [System.Net.WebRequest]::Create($healthUrl)
        $request.Proxy = $null
        $request.Timeout = 2000
        $response = $request.GetResponse()
        $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
        return ($reader.ReadToEnd() | ConvertFrom-Json)
    }
    catch { return $null }
    finally {
        if ($reader) { $reader.Dispose() }
        if ($response) { $response.Dispose() }
    }
}
$health = Read-BridgeHealth
if (-not $health) { throw 'Bridge is not responding; no process was stopped.' }
if ($health.id -ne 'codex-grok-context-bridge-v1' -or $health.directory -ne $bridgeRoot -or $health.pid -ne $state.pid) {
    throw 'Bridge identity mismatch; refusing to stop any process.'
}
$process = Get-Process -Id $state.pid -ErrorAction Stop
if ($process.ProcessName -ne 'node') { throw 'Unexpected process identity; refusing to stop.' }
Stop-Process -Id $state.pid
Write-Output 'Stopped only the Codex Grok bridge. If needed, restore the direct provider URL before using Codex again.'
