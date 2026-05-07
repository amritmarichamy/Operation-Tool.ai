# Terra Tern CRM — keep Flask on port 8080 running (restart after exit/crash).
# Usage: right-click → Run with PowerShell, or Task Scheduler (see project README / team wiki).
# Prefers .venv Python; falls back to `python` on PATH.

$ErrorActionPreference = "Continue"
$root = $PSScriptRoot
if (-not $root) { $root = Get-Location.Path }
Set-Location $root

$py = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $py)) {
    Write-Host "[CRM] No .venv\Scripts\python.exe — using 'python' from PATH." -ForegroundColor Yellow
    $py = "python"
}

Write-Host "[CRM] Directory: $root" -ForegroundColor Cyan
Write-Host "[CRM] Python:    $py" -ForegroundColor Cyan
Write-Host "[CRM] Stop: close this window or Ctrl+C." -ForegroundColor Yellow

while ($true) {
    Write-Host "`n[CRM] Starting $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ..." -ForegroundColor Green
    try {
        & $py $([System.IO.Path]::Combine($root, "server.py"))
    }
    catch {
        Write-Host "[CRM] Error: $_" -ForegroundColor Red
    }
    $code = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { -1 }
    Write-Host "[CRM] Stopped (exit $code) $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'). Restart in 5s..." -ForegroundColor DarkYellow
    Start-Sleep -Seconds 5
}
