# DesktopPet local quality gate (same steps as CI)
# Usage: powershell -ExecutionPolicy Bypass -File scripts\verify-local.ps1 [-SkipBuild]
param(
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host '==> npm typecheck'
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw "typecheck failed ($LASTEXITCODE)" }

Write-Host '==> npm test (vitest)'
npm test
if ($LASTEXITCODE -ne 0) { throw "unit tests failed ($LASTEXITCODE)" }

if (-not $SkipBuild) {
  Write-Host '==> npm run build (electron-vite)'
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "build failed ($LASTEXITCODE)" }
}

Write-Host '==> verify dist artifacts (out/)'
$required = @(
  'out/main/index.js',
  'out/preload/index.js',
  'out/renderer/index.html'
)
$missing = @()
foreach ($rel in $required) {
  $path = Join-Path $root $rel
  if (-not (Test-Path $path)) {
    $missing += $rel
  } else {
    $item = Get-Item $path
    Write-Host ("  OK  {0}  ({1} bytes)" -f $rel, $item.Length)
  }
}

if ($missing.Count -gt 0) {
  if ($SkipBuild) {
    Write-Host ("  WARN missing artifacts (SkipBuild): {0}" -f ($missing -join ', '))
  } else {
    throw ("missing build artifacts: {0}" -f ($missing -join ', '))
  }
} else {
  Write-Host '  all required artifacts present'
}

Write-Host '==> verify-local PASSED'
exit 0
