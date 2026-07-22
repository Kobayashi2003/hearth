# Rebuild and restart the backend on the configured port, replacing any
# instance already holding it. Development helper only.
param([int]$Port = 5311)

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listener) {
    $listener.OwningProcess | Select-Object -Unique | ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 500
}

$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    & npx tsc -b packages/shared server
    if ($LASTEXITCODE -ne 0) { throw "build failed" }

    Start-Process -FilePath 'node' -ArgumentList 'server/dist/main.js' `
        -RedirectStandardOutput "$env:TEMP\hearth-dev.log" `
        -RedirectStandardError "$env:TEMP\hearth-dev.err" `
        -WindowStyle Hidden

    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 250
        try {
            Invoke-RestMethod "http://127.0.0.1:$Port/api/system/health" -TimeoutSec 1 | Out-Null
            Write-Output "hearth-server ready on $Port"
            exit 0
        } catch { }
    }
    throw "server did not become ready"
} finally {
    Pop-Location
}
