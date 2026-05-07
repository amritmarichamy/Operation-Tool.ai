# Removes the Terra Tern CRM scheduled task.

$ErrorActionPreference = "Stop"
$taskName = "TerraTern_ColdEmail_CRM"

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "[CRM] Task '$taskName' removed." -ForegroundColor Green
} else {
    Write-Host "[CRM] Task was not registered (nothing to remove)." -ForegroundColor Yellow
}
