const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { exec, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

let mainWindow;
let examInProgress = false;
let monitoringInterval = null;
let logFile = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    show: false,
    resizable: false,
    maximizable: false,
    title: "Secure Exam Launcher",
  });

  mainWindow.loadFile("index.html");

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    initializeLogging();
    checkAdminPrivileges();
  });

  mainWindow.on("closed", () => {
    if (examInProgress) {
      emergencyRestore();
    }
    mainWindow = null;
  });
}

// Enhanced logging system
function initializeLogging() {
  const logDir = path.join(process.cwd(), "exam_logs");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  logFile = path.join(
    logDir,
    `exam_${new Date().toISOString().replace(/[:.]/g, "-")}.log`
  );
  writeLog("System initialized", "INFO");
}

function writeLog(message, level = "INFO") {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${message}\n`;

  console.log(logEntry.trim());

  if (logFile) {
    try {
      fs.appendFileSync(logFile, logEntry);
    } catch (error) {
      console.error("Failed to write to log file:", error);
    }
  }
}

function checkAdminPrivileges() {
  exec("net session", (error) => {
    if (error) {
      writeLog("Administrator privileges check failed", "ERROR");
      dialog.showErrorBox(
        "Administrator Rights Required",
        'This application requires administrator privileges.\n\nPlease:\n1. Close this application\n2. Right-click on SecureExamLauncher.exe\n3. Select "Run as administrator"'
      );
      app.quit();
    } else {
      writeLog("Administrator privileges confirmed", "INFO");
      mainWindow.webContents.send("admin-check-passed");
      createEmergencyRestoreScript();
    }
  });
}

// Create emergency restore script for failsafe
function createEmergencyRestoreScript() {
  const emergencyScript = `@echo off
echo Emergency System Restore - Secure Exam Launcher
echo ================================================
echo.
echo This will restore all system settings to normal.
echo.
pause

:: Restore USB access
reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\USBSTOR" /v "Start" /t REG_DWORD /d 3 /f >nul 2>&1

:: Restore Task Manager
reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" /v "DisableTaskMgr" /f >nul 2>&1

:: Restore Registry Editor
reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" /v "DisableRegistryTools" /f >nul 2>&1

:: Restore Windows keys
reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" /v "NoWinKeys" /f >nul 2>&1

:: Restore Run dialog
reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" /v "NoRun" /f >nul 2>&1

:: Restore Bluetooth
sc config bthserv start= manual >nul 2>&1
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
`;

  try {
    fs.writeFileSync("EmergencyRestore.bat", emergencyScript);
    writeLog("Emergency restore script created", "INFO");
  } catch (error) {
    writeLog(`Failed to create emergency script: ${error.message}`, "ERROR");
  }
}

function getSEBPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "exam_config.seb");
  } else {
    return path.join(__dirname, "exam_config.seb");
  }
}

function createSystemBackup() {
  return new Promise((resolve, reject) => {
    writeLog("Starting system backup", "INFO");

    const backupDir = "exam_backup";
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const backupCommands = [
      'reg export "HKLM\\SYSTEM\\CurrentControlSet\\Services\\USBSTOR" "exam_backup\\usb.reg" /y',
      'reg export "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" "exam_backup\\taskmanager.reg" /y',
      'netsh advfirewall export "exam_backup\\firewall.wfw"',
    ];

    executeCommandsWithLogging(backupCommands, "BACKUP", resolve, reject);
  });
}

function applySystemRestrictions() {
  return new Promise((resolve, reject) => {
    writeLog("Applying system restrictions", "INFO");

    const restrictionCommands = [
      // Create registry keys if they don't exist
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" /f',

      // Block USB storage
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\USBSTOR" /v "Start" /t REG_DWORD /d 4 /f',

      // Disable Task Manager
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" /v "DisableTaskMgr" /t REG_DWORD /d 1 /f',

      // Disable Registry Editor
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" /v "DisableRegistryTools" /t REG_DWORD /d 1 /f',

      // Disable Windows key shortcuts
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" /v "NoWinKeys" /t REG_DWORD /d 1 /f',

      // Disable Run dialog
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" /v "NoRun" /t REG_DWORD /d 1 /f',

      // Stop Bluetooth
      "sc stop bthserv",
      "sc config bthserv start= disabled",

      // Disable WiFi hotspot
      "netsh wlan set hostednetwork mode=disallow",

      // Enhanced firewall rules - more specific blocking
      'netsh advfirewall firewall delete rule name="EXAM_BlockAll"',
      'netsh advfirewall firewall delete rule name="EXAM_AllowHTTPS"',
      'netsh advfirewall firewall delete rule name="EXAM_AllowDNS"',
      'netsh advfirewall firewall delete rule name="EXAM_AllowSEB"',

      // Allow specific SEB traffic
      'netsh advfirewall firewall add rule name="EXAM_AllowSEB" dir=out program="C:\\Program Files\\SafeExamBrowser\\SafeExamBrowser.exe" action=allow',
      'netsh advfirewall firewall add rule name="EXAM_AllowSEB" dir=out program="C:\\Program Files (x86)\\SafeExamBrowser\\SafeExamBrowser.exe" action=allow',
      'netsh advfirewall firewall add rule name="EXAM_AllowDNS" dir=out remoteport=53 protocol=UDP action=allow',
      'netsh advfirewall firewall add rule name="EXAM_AllowHTTPS" dir=out remoteport=443 protocol=TCP action=allow',

      // Block common applications
      'netsh advfirewall firewall add rule name="EXAM_BlockAll" dir=out action=block',

      // Kill screen recording and remote desktop applications
      "taskkill /f /im obs64.exe",
      "taskkill /f /im obs32.exe",
      "taskkill /f /im bandicam.exe",
      "taskkill /f /im camtasia.exe",
      "taskkill /f /im anydesk.exe",
      "taskkill /f /im teamviewer.exe",
      "taskkill /f /im chrome_remote_desktop_host.exe",
      "taskkill /f /im rustdesk.exe",
      "taskkill /f /im vnc.exe",
      "taskkill /f /im GameBarPresenceWriter.exe",
    ];

    executeCommandsWithLogging(
      restrictionCommands,
      "RESTRICT",
      resolve,
      reject
    );
  });
}

function executeCommandsWithLogging(commands, operation, resolve, reject) {
  let successCount = 0;
  let failureCount = 0;

  function executeNext(index) {
    if (index >= commands.length) {
      writeLog(
        `${operation} completed: ${successCount} success, ${failureCount} failures`,
        "INFO"
      );
      resolve();
      return;
    }

    const command = commands[index];
    exec(command, (error, stdout, stderr) => {
      if (error) {
        if (command.includes("taskkill")) {
          writeLog(`${operation} - Process not found (OK): ${command}`, "INFO");
          successCount++;
        } else if (command.includes("delete rule")) {
          writeLog(`${operation} - Rule not found (OK): ${command}`, "INFO");
          successCount++;
        } else {
          writeLog(
            `${operation} - Command failed: ${command} - Error: ${error.message}`,
            "WARN"
          );
          failureCount++;
        }
      } else {
        writeLog(`${operation} - Command success: ${command}`, "DEBUG");
        successCount++;
      }

      executeNext(index + 1);
    });
  }

  executeNext(0);
}

function launchSafeExamBrowser() {
  const sebPath = getSEBPath();

  if (!fs.existsSync(sebPath)) {
    writeLog("SEB configuration file not found", "ERROR");
    dialog.showErrorBox(
      "Error",
      "Exam configuration not found in application package!"
    );
    return false;
  }

  writeLog(`Launching SEB with config: ${sebPath}`, "INFO");
  examInProgress = true;

  // Launch SEB with the embedded config file
  shell.openPath(sebPath).then((error) => {
    if (error) {
      writeLog(`Failed to launch SEB: ${error}`, "ERROR");
      dialog.showErrorBox(
        "Error",
        `Failed to launch Safe Exam Browser:\n${error}\n\nPlease ensure Safe Exam Browser is installed.`
      );
      examInProgress = false;
      return;
    }

    writeLog("SEB launched successfully", "INFO");
    // Hide main window during exam
    mainWindow.hide();

    // Start enhanced monitoring
    startSEBMonitoring();
  });

  return true;
}

function startSEBMonitoring() {
  writeLog("Starting SEB monitoring", "INFO");

  // Enhanced SEB process detection
  const sebProcessNames = [
    "SafeExamBrowser.exe",
    "SEB.exe",
    "SEB64.exe",
    "SafeExamBrowser64.exe",
  ];

  monitoringInterval = setInterval(() => {
    // Check for any SEB process
    const checkCommands = sebProcessNames.map(
      (name) =>
        `tasklist /fi "imagename eq ${name}" /fo csv | find /i "${name}"`
    );

    let sebFound = false;
    let checksCompleted = 0;

    checkCommands.forEach((command, index) => {
      exec(command, (error, stdout) => {
        checksCompleted++;

        if (!error && stdout.trim()) {
          sebFound = true;
          writeLog(`SEB process detected: ${sebProcessNames[index]}`, "DEBUG");
        }

        // All checks completed
        if (checksCompleted === checkCommands.length) {
          if (!sebFound && examInProgress) {
            writeLog("No SEB processes found - exam completed", "INFO");
            clearInterval(monitoringInterval);
            examInProgress = false;
            restoreSystemSettings().then(() => {
              dialog
                .showMessageBox(null, {
                  type: "info",
                  title: "Exam Complete",
                  message:
                    "Your exam has been completed.\n\nYour computer has been restored to normal operation.",
                  buttons: ["OK"],
                })
                .then(() => {
                  app.quit();
                });
            });
          }
        }
      });
    });
  }, 3000); // Check every 3 seconds
}

function restoreSystemSettings() {
  return new Promise((resolve) => {
    writeLog("Starting system restoration", "INFO");

    if (monitoringInterval) {
      clearInterval(monitoringInterval);
      monitoringInterval = null;
    }

    const restoreCommands = [
      // Restore USB access
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\USBSTOR" /v "Start" /t REG_DWORD /d 3 /f',

      // Restore Task Manager
      'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" /v "DisableTaskMgr" /f',

      // Restore Registry Editor
      'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" /v "DisableRegistryTools" /f',

      // Restore Windows keys
      'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" /v "NoWinKeys" /f',

      // Restore Run dialog
      'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" /v "NoRun" /f',

      // Restore Bluetooth
      "sc config bthserv start= manual",
      "sc start bthserv",

      // Restore WiFi hotspot
      "netsh wlan set hostednetwork mode=allow",

      // Remove firewall rules
      'netsh advfirewall firewall delete rule name="EXAM_BlockAll"',
      'netsh advfirewall firewall delete rule name="EXAM_AllowHTTPS"',
      'netsh advfirewall firewall delete rule name="EXAM_AllowDNS"',
      'netsh advfirewall firewall delete rule name="EXAM_AllowSEB"',
    ];

    executeCommandsWithLogging(restoreCommands, "RESTORE", resolve, () =>
      resolve()
    );
  });
}

function emergencyRestore() {
  writeLog("Emergency restore initiated", "WARN");
  restoreSystemSettings().then(() => {
    writeLog("Emergency restore completed", "INFO");
  });
}

// IPC handlers
ipcMain.handle("start-exam", async () => {
  try {
    writeLog("Exam start requested", "INFO");

    mainWindow.webContents.send("status-update", "Creating system backup...");
    await createSystemBackup();

    mainWindow.webContents.send(
      "status-update",
      "Applying security restrictions..."
    );
    await applySystemRestrictions();

    mainWindow.webContents.send(
      "status-update",
      "Launching Safe Exam Browser..."
    );
    const launched = launchSafeExamBrowser();

    if (launched) {
      return { success: true };
    } else {
      return { success: false, error: "Failed to launch Safe Exam Browser" };
    }
  } catch (error) {
    writeLog(`Exam start failed: ${error.message}`, "ERROR");
    return { success: false, error: error.message };
  }
});

ipcMain.handle("emergency-restore", async () => {
  try {
    writeLog("Manual emergency restore requested", "WARN");
    await restoreSystemSettings();
    return { success: true };
  } catch (error) {
    writeLog(`Emergency restore failed: ${error.message}`, "ERROR");
    return { success: false, error: error.message };
  }
});

// App event handlers
app.whenReady().then(() => {
  createWindow();
});

app.on("window-all-closed", () => {
  if (examInProgress) {
    emergencyRestore().then(() => {
      app.quit();
    });
  } else {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (examInProgress) {
    event.preventDefault();
    emergencyRestore().then(() => {
      app.quit();
    });
  }
});
