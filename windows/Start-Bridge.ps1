$ErrorActionPreference = 'Stop'
$bridgeRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
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
if ($health) {
    if ($health.id -ne 'codex-grok-context-bridge-v1' -or $health.directory -ne $bridgeRoot) {
        throw 'Port 20129 is occupied by another service. Nothing was changed.'
    }
    Write-Output "Bridge is already running (PID $($health.pid))."
    exit 0
}
$runtimeFile = Join-Path $bridgeRoot 'runtime.json'
if (Test-Path -LiteralPath $runtimeFile) {
    $runtime = Get-Content -Raw -LiteralPath $runtimeFile | ConvertFrom-Json
    $node = $runtime.node_executable
    $env:OMNIROUTE_CODEX_GROK_ALIASES = @($runtime.grok_aliases) -join ','
} else {
    $node = (Get-Command node.exe -ErrorAction Stop).Source
}
if (-not (Test-Path -LiteralPath $node)) { throw 'The installed Node.js runtime was not found.' }
$bridgeFile = Join-Path $bridgeRoot 'bridge.mjs'
$process = Start-Process -FilePath $node -ArgumentList ('"' + $bridgeFile + '"') -WindowStyle Hidden -WorkingDirectory $bridgeRoot -RedirectStandardOutput (Join-Path $bridgeRoot 'bridge.stdout.log') -RedirectStandardError (Join-Path $bridgeRoot 'bridge.stderr.log') -PassThru
for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 250
    $health = Read-BridgeHealth
    if ($health -and $health.id -eq 'codex-grok-context-bridge-v1' -and $health.directory -eq $bridgeRoot -and $health.pid -eq $process.Id) {
        Write-Output "Bridge running on 127.0.0.1:20129 (PID $($process.Id))."
        exit 0
    }
    if ($process.HasExited) { break }
}
throw 'Bridge did not become ready. Codex configuration has not been changed by this launcher. Check bridge.stderr.log.'
