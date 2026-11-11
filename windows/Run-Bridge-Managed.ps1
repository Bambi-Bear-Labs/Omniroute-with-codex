$ErrorActionPreference = 'Stop'
$bridgeRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeFile = Join-Path $bridgeRoot 'runtime.json'
if (Test-Path -LiteralPath $runtimeFile) {
    $runtime = Get-Content -Raw -LiteralPath $runtimeFile | ConvertFrom-Json
    $node = $runtime.node_executable
    $env:OMNIROUTE_CODEX_GROK_ALIASES = @($runtime.grok_aliases) -join ','
} else {
    $node = (Get-Command node.exe -ErrorAction Stop).Source
}
$bridgeFile = Join-Path $bridgeRoot 'bridge.mjs'
$managerLog = Join-Path $bridgeRoot 'managed-startup.log'
function Write-ManagerLog([string]$message) {
    Add-Content -LiteralPath $managerLog -Value ((Get-Date -Format o) + ' ' + $message) -Encoding UTF8
}
function Read-Health {
    $response = $null
    $reader = $null
    try {
        $request = [System.Net.WebRequest]::Create('http://127.0.0.1:20129/__codex_grok_bridge_health')
        $request.Proxy = $null
        $request.Timeout = 2000
        $response = $request.GetResponse()
        $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
        return ($reader.ReadToEnd() | ConvertFrom-Json)
    } catch { return $null }
    finally {
        if ($reader) { $reader.Dispose() }
        if ($response) { $response.Dispose() }
    }
}
Write-ManagerLog 'Windows-managed bridge supervisor started.'
while ($true) {
    try {
        $health = Read-Health
        if ($health) {
            if ($health.id -ne 'codex-grok-context-bridge-v1' -or $health.directory -ne $bridgeRoot) {
                throw 'The bridge port is owned by another service; no process was stopped.'
            }
            # Reuse a pre-existing healthy instance instead of creating duplicates.
            Start-Sleep -Seconds 2
            continue
        }
        $child = Start-Process -FilePath $node -ArgumentList ('"' + $bridgeFile + '"') -WindowStyle Hidden -WorkingDirectory $bridgeRoot -RedirectStandardOutput (Join-Path $bridgeRoot 'bridge.stdout.log') -RedirectStandardError (Join-Path $bridgeRoot 'bridge.stderr.log') -PassThru
        Write-ManagerLog ('Started bridge PID ' + $child.Id + '.')
        # Keep the scheduled task alive and owning its worker. Do not detach and exit.
        $child.WaitForExit()
        Write-ManagerLog ('Bridge exited with code ' + $child.ExitCode + '; restarting.')
    } catch {
        Write-ManagerLog ('Startup/recovery error: ' + $_.Exception.Message)
    }
    Start-Sleep -Seconds 1
}
