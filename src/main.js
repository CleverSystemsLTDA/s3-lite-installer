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

// Atualizacao em duas fases, para o sistema nunca ficar fechado esperando download:
// - updatedownloaded 0: abre o app na hora e baixa a atualizacao em segundo plano.
//   Quando termina, so marca updatedownloaded = 1.
// - updatedownloaded 1: antes de abrir o app, procura de novo. O download sai do cache
//   (rapido) e instala. Se nao tiver atualizacao, der erro ou passar do tempo, abre o app.
// Com o app aberto o quitAndInstall nunca roda: o instalador nao troca o application.exe em uso.
const INSTALL_TIMEOUT_MS = 60 * 1000;
let installOnStart = false;
let installTimer = null;

function stopInstallTimer() {
  if (installTimer) {
    clearTimeout(installTimer);
    installTimer = null;
  }
}

// Sem atualizacao para instalar agora: limpa a marca e abre o app (se ainda nao abriu).
function noUpdate() {
  stopInstallTimer();
  if (updateJson.updatedownloaded === 1) {
    log.info(`Alterando para disponível para download`);
    writeJson({ updatedownloaded: 0 });
  }
  openApplication();
}

function updaterListeners() {
  autoUpdater.on("update-available", (info) => {
    const arrVersion = info.version.split("-");
    const updateChannel = arrVersion[1];

    if (updateChannel !== autoUpdater.channel) {
      log.info(`Update V${info.version} é de outro canal (${updateChannel}), ignorando`);
      noUpdate();
      return;
    }

    log.info(`Update disponível: V${info.version}`);
    autoUpdater.downloadUpdate().catch((error) => {
      log.error("Erro ao baixar atualização:", error && error.message);
    });
  });

  autoUpdater.on("update-not-available", () => {
    log.info("Update not Available");
    noUpdate();
  });

  autoUpdater.on("update-downloaded", () => {
    if (installOnStart && !child) {
      stopInstallTimer();
      log.info(`Download concluído... pronto para instalar atualização`);
      // Volta para 0 antes: se o instalador falhar, o proximo inicio abre o app
      // em vez de tentar instalar de novo a cada boot.
      writeJson({ updatedownloaded: 0 });
      autoUpdater.quitAndInstall(true, true);
      return;
    }

    log.info(`Alterando para Downloaded (instala no próximo início)`);
    writeJson({ updatedownloaded: 1 });
  });

  autoUpdater.on("download-progress", (progressObj) => {
    downloadPercent = progressObj.percent;
  });

  autoUpdater.on("error", (message) => {
    log.info("Erro em buscar atualização");
    log.info(message);
    stopInstallTimer();
    openApplication();
  });
}

function openApplication() {
  if (child) return;

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

// Um launcher so: um clique no atalho com o sistema aberto nao abre outro application.exe.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  log.info("Launcher já está rodando, saindo");
  app.quit();
}

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return;
  autoUpdater.logger = log;
  autoUpdater.logger.transports.file.level = "info";
  log.info("App starting...");
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = true;
  // 3.x (licenciamento): v3alpha, v3beta, v3. Canal proprio para a 2.x (alpha, beta,
  // latest) nao enxergar a 3.x; a 3.0 entra a mao, com a ativacao da licenca.
  // Sem "-" no nome: o update-available le o canal com split("-")[1].
  autoUpdater.channel = "v3alpha";
  // Depois do channel: o setter do channel liga allowDowngrade = true sozinho.
  // false: uma maquina instalada a mao com uma versao nova nao pode voltar
  // sozinha para uma versao menor do mesmo canal.
  // Voltar atras passa a ser so instalando a versao antiga por cima, a mao.
  autoUpdater.allowDowngrade = false;

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

  installOnStart = updateJson.updatedownloaded === 1;
  if (installOnStart) {
    log.info("Atualização baixada, instalando antes de abrir o sistema...");
    installTimer = setTimeout(() => {
      installTimer = null;
      log.warn(`Atualização não respondeu em ${INSTALL_TIMEOUT_MS / 1000}s, abrindo o sistema (instala no próximo início)`);
      openApplication();
    }, INSTALL_TIMEOUT_MS);
  } else {
    openApplication();
  }

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    log.error("Erro em checkForUpdates:", error && error.message);
    stopInstallTimer();
    openApplication();
  }
});