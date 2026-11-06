param([string]$ServerDir = "", [int]$Port = 4177, [switch]$ReadOnly)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Install Node.js 20 or newer." }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "Docker Desktop is required." }
if (-not $ServerDir) {
  $paths = @((Join-Path $PSScriptRoot '..\reborn-server'),(Join-Path $env:USERPROFILE 'reborn-server'),(Join-Path $env:USERPROFILE 'OneDrive\Documents\reborn-server'),(Join-Path $env:USERPROFILE 'Documents\reborn-server'))
  $ServerDir = $paths | Where-Object { Test-Path (Join-Path $_ 'docker-compose.yml') } | Select-Object -First 1
}
if (-not $ServerDir -or -not (Test-Path (Join-Path $ServerDir 'docker-compose.yml'))) {
  throw "Run .\Start-GameMaster.ps1 -ServerDir 'C:\path\to\reborn-server'"
}
$env:ORBUS_SERVER_PATH = (Resolve-Path $ServerDir).Path
$env:GM_PORT = "$Port"
$env:GM_READ_ONLY = if ($ReadOnly) { '1' } else { '0' }
if (-not $env:GM_TOKEN) {
  $buffer = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
  $env:GM_TOKEN = [BitConverter]::ToString($buffer).Replace('-', '').ToLowerInvariant()
}
Write-Host "GameMaster: http://127.0.0.1:$Port"
Write-Host "ACCESS TOKEN: $env:GM_TOKEN" -ForegroundColor Yellow
Start-Process "http://127.0.0.1:$Port"
node src/server.mjs
