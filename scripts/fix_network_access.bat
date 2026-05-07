@echo off
:: This script adds a firewall rule to allow TerraTern CRM on port 8080
:: It requires Administrator privileges.

echo Checking for Administrator privileges...
net session >nul 2>&1
if %errorLevel% == 0 (
    echo [OK] Running as Administrator.
) else (
    echo [ERROR] This script MUST be run as Administrator.
    echo Please right-click this file and select "Run as administrator".
    pause
    exit /b 1
)

echo Adding Firewall Rule for Port 8080...
netsh advfirewall firewall add rule name="TerraTern CRM Port 8080" dir=in action=allow protocol=TCP localport=8080

if %errorLevel% == 0 (
    echo [SUCCESS] Firewall rule added successfully!
    echo You can now access the CRM on other devices via WiFi.
) else (
    echo [FAILED] Could not add firewall rule.
)

pause
