[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9 ._-]{0,47}$')][string]$Source,
    [Parameter(Mandatory = $true)][string]$Command,
    [string[]]$CommandArgs = @()
)

# This wrapper observes the process lifetime, not individual turns inside a TUI.
$mimiSessionId = [guid]::NewGuid().ToString()
$mimiPort = if ($env:MIMI_PET_PORT) { [int]$env:MIMI_PET_PORT } else { 47831 }
$mimiTokenPath = if ($env:MIMI_PET_TOKEN_FILE) { $env:MIMI_PET_TOKEN_FILE } else { Join-Path $HOME '.mimi-pet\token' }

function Send-MimiState([string]$State) {
    try {
        $mimiToken = (Get-Content -LiteralPath $mimiTokenPath -Raw -ErrorAction Stop).Trim()
        $mimiBody = @{ source = $Source; event = $State; sessionId = $mimiSessionId } | ConvertTo-Json -Compress
        Invoke-RestMethod -Uri "http://127.0.0.1:$mimiPort/events" -Method Post -ContentType 'application/json' -Headers @{ 'X-Mimi-Token' = $mimiToken } -Body $mimiBody -TimeoutSec 1 -ErrorAction Stop | Out-Null
    } catch { }
}

$mimiExitCode = 1
Send-MimiState 'working'
try {
    & $Command @CommandArgs
    $mimiSucceeded = $?
    $mimiExitCode = if ($mimiSucceeded) { 0 } elseif ($LASTEXITCODE) { $LASTEXITCODE } else { 1 }
} catch {
    Write-Error $_
} finally {
    if ($mimiExitCode -eq 0) { Send-MimiState 'success' } else { Send-MimiState 'error' }
}
exit $mimiExitCode
