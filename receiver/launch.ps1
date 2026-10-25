$ErrorActionPreference = 'Stop'
try {
    Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw 'Install Node.js 24 LTS from https://nodejs.org then reopen this launcher.'
    }
    Write-Host 'F7R Race Control - live receiver'
    Write-Host 'Game settings: UDP On, Broadcast On, port 20777, format 2026.'
    Write-Host 'Close Racing League Tools first so it does not occupy the same port.'
    $raceId = Read-Host 'Race ID (Enter for F7R Live Race)'
    if (-not $raceId) { $raceId = 'cda3f85a-268a-40b7-87d9-869932e749eb' }
    $gameIp = Read-Host 'Game device IP (Enter to detect automatically on Wi-Fi)'
    $env:F7R_SESSION_ID = $raceId
    $env:F7R_GAME_IP = if ($gameIp) { $gameIp } else { 'auto' }
    $env:F7R_RECEIVER_EMAIL = 'formula7racing@gmail.com'
    $credential = Get-Credential -UserName $env:F7R_RECEIVER_EMAIL -Message 'Sign in with your F7R receiver account'
    if (-not $credential) { throw 'Sign-in cancelled.' }
    $env:F7R_RECEIVER_PASSWORD = $credential.GetNetworkCredential().Password
    & node receiver/start.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Receiver stopped. See the message above.' }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
} finally {
    Remove-Item Env:F7R_RECEIVER_PASSWORD -ErrorAction SilentlyContinue
}
