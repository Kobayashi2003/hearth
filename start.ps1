# ============================================================================
# Whole-app launcher. Boots the backend and the Caddy edge, and forwards Ctrl+C
# to both:
#   1. backend — node server/dist/main.js, loopback only
#   2. Caddy   — the public ingress, on -Bind (default :17012);
#                routes are in ./Caddyfile.snippet, upstreams from ./caddy-env.ps1
#
# There is no frontend process any more: the SPA is static assets Caddy serves
# directly from web/dist. The backend binds loopback because a single public port
# may front several apps — run with -NoCaddy to let a shared edge own the
# port instead.
#
# Usage:
#   .\start.ps1            # start with whatever is already built
#   .\start.ps1 -Build     # pnpm build first
#   .\start.ps1 -NoCaddy   # skip the edge (an external edge owns the port)
#   .\start.ps1 -Bind :8080
# ============================================================================

[CmdletBinding()]
param(
    [switch]$Build,
    [switch]$NoCaddy,
    [string]$Bind = ':17012'
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

if (-not $NoCaddy) {
    if (-not (Get-Command caddy -ErrorAction SilentlyContinue)) {
        throw 'caddy is not on PATH (https://caddyserver.com/download), or pass -NoCaddy if another edge owns the port.'
    }
    # This edge and any shared edge want the same port, by design. Say so plainly
    # rather than letting Caddy fail to bind and bury the reason in its JSON log.
    $bindPort = [int]($Bind -split ':')[-1]
    if (Get-NetTCPConnection -LocalPort $bindPort -State Listen -ErrorAction SilentlyContinue) {
        throw "Port $bindPort is already in use — another edge (a shared one, or an earlier run) owns it. Stop it first, or pass -NoCaddy."
    }
}

foreach ($tool in 'node', 'pnpm') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        throw "$tool is not on PATH."
    }
}
if (-not (Test-Path (Join-Path $root 'node_modules'))) {
    throw 'Dependencies are not installed. Run `pnpm install` in the repository root first.'
}

if ($Build) {
    Write-Host '[BUILD] pnpm build' -ForegroundColor Cyan
    Push-Location $root
    try { pnpm build } finally { Pop-Location }
    # A failed build would otherwise launch the previous, stale artifacts.
    if ($LASTEXITCODE -ne 0) { throw "pnpm build failed (exit $LASTEXITCODE)" }
}

# caddy-env.ps1 owns where Hearth listens: the backend port from .env, the static
# web root under web/dist. Ask it rather than restating either here.
$caddyEnv = & (Join-Path $root 'caddy-env.ps1')
$caddyEnv.CADDY_BIND = $Bind

$backendJs = Join-Path $root 'server\dist\main.js'
$webIndex  = Join-Path $root 'web\dist\index.html'

# Fail with a clear reason rather than letting node die on MODULE_NOT_FOUND or
# Caddy serve a 404 for a missing bundle.
if (-not (Test-Path $backendJs)) { throw "Backend not built: $backendJs is missing. Run with -Build first." }
if (-not $NoCaddy -and -not (Test-Path $webIndex)) {
    throw "Frontend not built: $webIndex is missing. Run with -Build first."
}

$children = @()

# Every spawn lives inside this try, so a failure part-way through tears down what
# already started instead of orphaning it, still holding its port.
try {
    Write-Host "[START] backend on $($caddyEnv.HEARTH_BACKEND_UPSTREAM)$($caddyEnv.HEARTH_API_PREFIX)" -ForegroundColor Green
    $children += Start-Process -FilePath 'node' -ArgumentList 'server/dist/main.js' `
        -WorkingDirectory $root -NoNewWindow -PassThru

    if ($NoCaddy) {
        Write-Host '[START] Caddy skipped (-NoCaddy); an external edge owns the port.' -ForegroundColor Yellow
    } else {
        # Caddy tolerates upstreams still coming up (502 until they answer), so it
        # needs no ordering against the backend above.
        Write-Host "[START] Caddy on $Bind$($caddyEnv.HEARTH_WEB_PREFIX)  <- the only public ingress" -ForegroundColor Green

        # Start-Process has no -Environment parameter, so set these on this process
        # (children inherit) and restore afterwards.
        $saved = @{}
        foreach ($key in $caddyEnv.Keys) {
            $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
            [Environment]::SetEnvironmentVariable($key, [string]$caddyEnv[$key], 'Process')
        }
        try {
            $children += Start-Process -FilePath 'caddy' `
                -ArgumentList @('run', '--config', (Join-Path $root 'Caddyfile'), '--adapter', 'caddyfile') `
                -WorkingDirectory $root -NoNewWindow -PassThru
        } finally {
            foreach ($key in $saved.Keys) {
                [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process')
            }
        }
    }

    Write-Host ''
    Write-Host 'Press Ctrl+C to stop.'
    Write-Host ''

    # Stop as soon as ANY child dies, rather than waiting for all of them: if the
    # backend crashes, a still-running edge would serve a broken site with nothing
    # to say so.
    while ($true) {
        Start-Sleep -Seconds 1
        $dead = $children | Where-Object { $_.HasExited } | Select-Object -First 1
        if ($dead) {
            Write-Host "[EXIT] a child exited with $($dead.ExitCode); stopping the rest." -ForegroundColor Yellow
            break
        }
    }
} finally {
    # Ctrl+C is the graceful path — Windows fans it out to the whole console
    # process group. This is the backstop for an external kill.
    foreach ($p in $children) {
        if ($p -and -not $p.HasExited) {
            Start-Process -FilePath 'taskkill' -ArgumentList @('/F','/T','/PID',$p.Id) `
                -NoNewWindow -Wait -ErrorAction SilentlyContinue | Out-Null
        }
    }
}
