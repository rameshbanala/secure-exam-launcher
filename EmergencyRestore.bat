@echo off
echo Emergency System Restore - Secure Exam Launcher
echo ================================================
echo.
echo This will restore all system settings to normal.
echo.
pause

:: Restore USB access
reg add "HKLM\SYSTEM\CurrentControlSet\Services\USBSTOR" /v "Start" /t REG_DWORD /d 3 /f >nul 2>&1

:: Restore Task Manager
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System" /v "DisableTaskMgr" /f >nul 2>&1

:: Restore Windows keys
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer" /v "NoWinKeys" /f >nul 2>&1

:: Restore Run dialog
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer" /v "NoRun" /f >nul 2>&1

:: Restore Bluetooth
sc config bthserv start= demand >nul 2>&1
sc start bthserv >nul 2>&1

:: Restore WiFi hotspot
netsh wlan set hostednetwork mode=allow >nul 2>&1

:: Remove firewall rules
netsh advfirewall firewall delete rule name="EXAM_BlockAll" >nul 2>&1
netsh advfirewall firewall delete rule name="EXAM_AllowHTTPS" >nul 2>&1
netsh advfirewall firewall delete rule name="EXAM_AllowDNS" >nul 2>&1
netsh advfirewall firewall delete rule name="EXAM_AllowSEB" >nul 2>&1

echo.
echo Emergency restore completed!
echo Your computer should now work normally.
echo.
pause
