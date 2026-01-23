const { app, dialog, BrowserWindow } = require("electron");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const { resolve, join } = require("path");
const fs = require("fs");
const { execFile, exec } = require("child_process");
const ProgressBar = require("electron-progressbar");

let mainWindow;
let child = null;
let downloadPercent = 0;

const extraPath = join(process.resourcesPath, "..");
const path = join(extraPath, "application.exe");
const updateJsonFile = join(extraPath, "update.json");
const updateJsonBackup = join(extraPath, "update.json.backup");

// Default JSON structure
const defaultUpdateJson = {
  updatedownloaded: 0,
  version: "1.0.0",
  lastFirewallUpdate: "1.0.0"
};

let updateJson = null;
let isWriting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      nodeIntegration: true,
    },
  });
}

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      log.warn(`JSON file not found: ${filePath}`);
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check if file is empty or contains only whitespace
    if (!content.trim()) {
      log.warn(`JSON file is empty: ${filePath}`);
      return null;
    }

    const parsed = JSON.parse(content);
    
    // Validate structure
    if (typeof parsed !== 'object' || parsed === null) {
      log.warn(`JSON file has invalid structure: ${filePath}`);
      return null;
    }

    return parsed;
  } catch (error) {
    log.error(`Error reading JSON file ${filePath}:`, error.message);
    return null;
  }
}

function loadUpdateJson() {
  // Try to load main file
  let json = safeReadJson(updateJsonFile);
  
  if (json === null) {
    log.warn("Main update.json is corrupted or missing, trying backup...");
    
    // Try backup file
    json = safeReadJson(updateJsonBackup);
    
    if (json === null) {
      log.warn("Backup is also corrupted or missing, using defaults...");
      json = { ...defaultUpdateJson };
    } else {
      log.info("Successfully loaded from backup, restoring main file...");
      // Restore main file from backup
      safeWriteJson(json);
    }
  }

  // Ensure all required properties exist
  updateJson = {
    ...defaultUpdateJson,
    ...json
  };

  log.info(`Loaded update.json: ${JSON.stringify(updateJson)}`);
  return updateJson;
}

async function safeWriteJson(json) {
  // Prevent concurrent writes
  if (isWriting) {
    log.warn("Write operation already in progress, skipping...");
    return false;
  }

  isWriting = true;

  try {
    // Validate JSON structure before writing
    if (typeof json !== 'object' || json === null) {
      throw new Error("Invalid JSON structure");
    }

    const jsonString = JSON.stringify(json, null, 2);
    const tempFile = updateJsonFile + '.tmp';

    // Write to temporary file first
    fs.writeFileSync(tempFile, jsonString, 'utf8');

    // Verify the temporary file by reading it back
    const verification = safeReadJson(tempFile);
    if (verification === null) {
      throw new Error("Failed to verify temporary file");
    }

    // Create backup of current file (if it exists and is valid)
    if (fs.existsSync(updateJsonFile)) {
      const currentJson = safeReadJson(updateJsonFile);
      if (currentJson !== null) {
        fs.copyFileSync(updateJsonFile, updateJsonBackup);
      }
    }

    // Atomically replace the main file
    fs.renameSync(tempFile, updateJsonFile);

    log.info(`Successfully wrote update.json: ${jsonString}`);
    return true;
  } catch (error) {
    log.error("Error writing JSON file:", error.message);
    
    // Clean up temp file if it exists
    const tempFile = updateJsonFile + '.tmp';
    if (fs.existsSync(tempFile)) {
      try {
        fs.unlinkSync(tempFile);
      } catch (cleanupError) {
        log.error("Error cleaning up temp file:", cleanupError.message);
      }
    }
    
    return false;
  } finally {
    isWriting = false;
  }
}

function writeJson(json) {
  updateJson = { ...updateJson, ...json };
  return safeWriteJson(updateJson);
}

// Function to update firewall rules (runs with admin privileges via scheduled task)
function updateFirewallRules() {
  return new Promise((resolve, reject) => {
    log.info("Updating firewall rules...");
    
    const exePath = app.getPath('exe');
    const installDir = join(process.resourcesPath, "..");
    
    // Paths that need firewall rules
    const s3litePath = join(installDir, 's3lite.exe');
    const applicationPath = join(installDir, 'application.exe');
    const updaterPath = join(installDir, 'resources', 'Update.exe');
    
    const commands = `
netsh advfirewall firewall delete rule name="s3lite"
netsh advfirewall firewall delete rule name="s3lite-app"
netsh advfirewall firewall delete rule name="s3lite-updater"
netsh advfirewall firewall add rule name="s3lite" dir=in action=allow program="${s3litePath}" enable=yes
netsh advfirewall firewall add rule name="s3lite" dir=out action=allow program="${s3litePath}" enable=yes
netsh advfirewall firewall add rule name="s3lite-app" dir=in action=allow program="${applicationPath}" enable=yes
netsh advfirewall firewall add rule name="s3lite-app" dir=out action=allow program="${applicationPath}" enable=yes
netsh advfirewall firewall add rule name="s3lite-updater" dir=in action=allow program="${updaterPath}" enable=yes
netsh advfirewall firewall add rule name="s3lite-updater" dir=out action=allow program="${updaterPath}" enable=yes
    `.trim();
    
    exec(commands, (error, stdout, stderr) => {
      if (error) {
        log.error('Failed to update firewall rules:', error);
        log.error('stderr:', stderr);
        reject(error);
        return;
      }
      log.info('Firewall rules updated successfully');
      log.info('stdout:', stdout);
      resolve();
    });
  });
}

// Check if running with admin privileges
function checkAdminPrivileges() {
  return new Promise((resolve) => {
    exec('net session', (error) => {
      if (error) {
        log.warn('Not running as admin - firewall updates will fail');
        resolve(false);
      } else {
        log.info('Running with admin privileges');
        resolve(true);
      }
    });
  });
}

function updaterListeners() {
  autoUpdater.on("update-available", (info) => {
    const arrVersion = info.version.split("-");
    const updateChannel = arrVersion[1];

    if (updateChannel === autoUpdater.channel) {
      log.info(`Update disponível: V${info.version}`);
      autoUpdater.downloadUpdate();
    }
  });

  autoUpdater.on("update-not-available", (info) => {
    log.info("Update not Available");
    if (updateJson.updatedownloaded === 1) {
      log.info(`Alterando para disponível para download`);
      updateJson.updatedownloaded = 0;
      writeJson(updateJson);
      openApplication();
    }
  });

  autoUpdater.on("update-downloaded", () => {
    if (updateJson.updatedownloaded === 1) {
      log.info(`Download concluído... pronto para instalar atualização`);
      autoUpdater.quitAndInstall(true, true);
    }

    if (updateJson.updatedownloaded === 0) {
      log.info(`Alterando para Downloaded`);
      updateJson.updatedownloaded = 1;
      writeJson(updateJson);
    }
  });

  autoUpdater.on("download-progress", (progressObj) => {
    downloadPercent = progressObj.percent;
  });

  autoUpdater.on("error", (message) => {
    log.info("Erro em buscar atualização");
    log.info(message);
    openApplication();
  });
}

function openApplication() {
  updateJson.version = app.getVersion();
  writeJson(updateJson);
  log.info(`Abrindo Sistema S3Lite...`);
  child = execFile(require.resolve(path));

  child.on("close", (code) => {
    app.exit(0);
  });
}

// Handle app termination gracefully
app.on('before-quit', (event) => {
  if (isWriting) {
    log.info("Write operation in progress, delaying quit...");
    event.preventDefault();
    
    // Wait for write to complete, then quit
    const checkWriting = setInterval(() => {
      if (!isWriting) {
        clearInterval(checkWriting);
        app.quit();
      }
    }, 100);
  }
});

app.whenReady().then(async () => {
  autoUpdater.logger = log;
  autoUpdater.logger.transports.file.level = "info";
  log.info("App starting...");
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = true;
  autoUpdater.allowPrerelease = true;
  autoUpdater.channel = "alpha"; // alpha, beta, latest

  log.info(`Version App: ${app.getVersion()}`);
  log.info(`Channel: ${autoUpdater.channel}`);

  // Load JSON with safety checks
  loadUpdateJson();

  // Check if we're running with admin privileges
  const hasAdmin = await checkAdminPrivileges();
  
  if (hasAdmin) {
    const currentVersion = app.getVersion();
    const lastFirewallUpdate = updateJson.lastFirewallUpdate || "0.0.0";
    
    // Update firewall rules if this is a new version
    if (currentVersion !== lastFirewallUpdate) {
      log.info(`Version changed from ${lastFirewallUpdate} to ${currentVersion}, updating firewall rules...`);
      
      try {
        await updateFirewallRules();
        updateJson.lastFirewallUpdate = currentVersion;
        writeJson(updateJson);
        log.info("Firewall rules updated for new version");
      } catch (error) {
        log.error("Failed to update firewall rules, but continuing anyway:", error);
      }
    } else {
      log.info("Firewall rules are up to date for current version");
    }
  } else {
    log.warn("Not running as admin - skipping firewall rule update");
    log.warn("Make sure the app is launched via the scheduled task for proper admin privileges");
  }

  createWindow();
  updaterListeners();
  const resultUpdater = await autoUpdater.checkForUpdatesAndNotify();
});