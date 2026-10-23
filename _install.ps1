param(
  [string]$Profile = "desktop",
  [string]$Dsh = "C:\Users\gsc\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$staging = Join-Path $root "_install-staging"

Write-Host "== staging packages ==" -ForegroundColor Cyan
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging | Out-Null
Copy-Item (Join-Path $root "packages\*") $staging -Recurse -Force

Write-Host "== removing previous install (forces a fresh pack) ==" -ForegroundColor Cyan
& $Dsh plugin --profile $Profile remove dsh-persona-select 2>&1 | Select-Object -Last 2

Write-Host "== installing from staging ==" -ForegroundColor Cyan
& $Dsh plugin --profile $Profile add "file:$staging\dsh-persona-select" 2>&1 | Select-Object -Last 6

Write-Host "== done; restart DSH to load the new component rows ==" -ForegroundColor Green
