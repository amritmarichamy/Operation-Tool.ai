# Registers a Windows Scheduled Task so the CRM starts at logon and survives brief failures.
# Run once (double-click InstallAutoStart.cmd or: powershell -ExecutionPolicy Bypass -File scripts\Install-CrmAutoStart.ps1).

param([switch]$RunAsAdmin)

$ErrorActionPreference = "Stop"
$taskName = "TerraTern_ColdEmail_CRM"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$batPath = Join-Path $ProjectRoot "run_server_24x7.cmd"
$pyPath = Join-Path $ProjectRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $batPath)) {
    throw "Missing run_server_24x7.cmd in $ProjectRoot"
}
if (-not (Test-Path -LiteralPath $pyPath)) {
    Write-Host "[CRM] Warning: .venv not found - create venv before relying on auto-start." -ForegroundColor Yellow
}

# Minimized window: start -> cmd /k keeps the 24/7 loop running
$arg = '/c start "TerraTern CRM" /MIN cmd.exe /k "' + $batPath + '"'
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument $arg -WorkingDirectory $ProjectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$settingsSplat = @{
    AllowStartIfOnBatteries       = $true
    DontStopIfGoingOnBatteries    = $true
    StartWhenAvailable            = $true
    MultipleInstances             = "IgnoreNew"
    RestartCount                  = 99
    RestartInterval             = (New-TimeSpan -Minutes 1)
}
try {
    $settings = New-ScheduledTaskSettingsSet @settingsSplat -ExecutionTimeLimit ([TimeSpan]::Zero)
} catch {
    $settings = New-ScheduledTaskSettingsSet @settingsSplat -ExecutionTimeLimit (New-TimeSpan -Days 3650)
}

# Limited avoids requiring Administrator for most PCs; use -RunAsAdmin if your policy needs Highest.
$runLevel = if ($RunAsAdmin) { "Highest" } else { "Limited" }
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel $runLevel

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
try {
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
} catch {
    Write-Host "[CRM] Register-ScheduledTask failed: $_" -ForegroundColor Red
    Write-Host "[CRM] Right-click InstallAutoStart.cmd -> Run as administrator, or run: Install-CrmAutoStart.ps1 -RunAsAdmin" -ForegroundColor Yellow
    exit 1
}

Write-Host "[CRM] Task '$taskName' installed - starts at logon (minimized)." -ForegroundColor Green
Write-Host "[CRM] Start now:  schtasks /Run /TN `"$taskName`"" -ForegroundColor Cyan
Write-Host "[CRM] Stop task: schtasks /End /TN `"$taskName`"" -ForegroundColor Cyan
