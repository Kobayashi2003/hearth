# The environment Caddyfile.snippet expands, derived from Hearth's own config.
# Returns a hashtable.
#
# Owned here, not by the callers, so every edge agrees on where Hearth listens:
# start.ps1 (standalone) and app-gateway (several apps behind one port) both
# source this file rather than restating ports. The .env file stays the authority
# for the backend port — it is what the backend actually binds.

[CmdletBinding()]
param()

function Read-DotEnv([string]$Path) {
    $result = @{}
    if (Test-Path $Path) {
        foreach ($line in Get-Content -LiteralPath $Path) {
            if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
                $result[$Matches[1]] = $Matches[2].Trim('"').Trim("'")
            }
        }
    }
    return $result
}

$dotenv = Read-DotEnv (Join-Path $PSScriptRoot '.env')

# The environment outranks .env, because the backend reads HEARTH_PORT from its
# own environment and dotenv does not overwrite what is already there: a caller
# that places the port (app-gateway does, so it can guarantee no two apps collide)
# would otherwise have the edge and the backend disagreeing about it.
# HEARTH_PORT is the prefixed name; the bare PORT is accepted for one release.
$backendPort = if ($env:HEARTH_PORT)   { $env:HEARTH_PORT }
               elseif ($dotenv.HEARTH_PORT) { $dotenv.HEARTH_PORT }
               elseif ($dotenv.PORT)    { $dotenv.PORT }
               else                     { 5111 }

$webRoot = Join-Path $PSScriptRoot 'web\dist'

return @{
    HEARTH_BACKEND_UPSTREAM = "127.0.0.1:$backendPort"
    HEARTH_WEB_ROOT         = $webRoot
}
