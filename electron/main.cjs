const { app, BrowserWindow, ipcMain, Menu, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const isDevelopment = !app.isPackaged;
app.commandLine.appendSwitch("enable-logging");
app.commandLine.appendSwitch("v", "1");

let logFile;

const TITLE_BAR_THEMES = {
  light: { color: "#00000000", symbolColor: "#20211f" },
  dark: { color: "#00000000", symbolColor: "#f1f0eb" },
  sepia: { color: "#00000000", symbolColor: "#4a3c2d" },
};

function log(event, data = {}) {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    event,
    data,
  });
  console.log(`[electron] ${line}`);
  if (logFile) fs.appendFileSync(logFile, `${line}\n`);
}

function createWindow() {
  Menu.setApplicationMenu(null);

  const window = new BrowserWindow({
    title: "Moon",
    icon: path.join(__dirname, "icon.ico"),
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#f0f0ed",
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      ...TITLE_BAR_THEMES.light,
      height: 32,
    },
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  window.once("ready-to-show", () => window.show());
  window.on("unresponsive", () => log("window:unresponsive"));
  window.on("responsive", () => log("window:responsive"));
  window.on("enter-full-screen", () => window.webContents.send("moon:fullscreen-changed", true));
  window.on("leave-full-screen", () => window.webContents.send("moon:fullscreen-changed", false));

  window.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "F11") {
      event.preventDefault();
      window.setFullScreen(!window.isFullScreen());
    }
  });

  window.webContents.on("did-start-loading", () => log("webcontents:did-start-loading"));
  window.webContents.on("did-finish-load", () => {
    log("webcontents:did-finish-load", { url: window.webContents.getURL() });
  });
  window.webContents.on("did-frame-finish-load", (_event, isMainFrame, frameProcessId, frameRoutingId) => {
    log("webcontents:did-frame-finish-load", { isMainFrame, frameProcessId, frameRoutingId });
  });
  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    log("webcontents:did-fail-load", { errorCode, errorDescription, validatedURL });
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    log("webcontents:render-process-gone", details);
  });
  window.webContents.on("console-message", (_event, ...args) => {
    const details = typeof args[0] === "object"
      ? args[0]
      : { level: args[0], message: args[1], lineNumber: args[2], sourceId: args[3] };
    log("renderer:console", details);
  });
  window.webContents.session.webRequest.onErrorOccurred((details) => {
    log("network:error", {
      error: details.error,
      method: details.method,
      resourceType: details.resourceType,
      url: details.url,
      webContentsId: details.webContentsId,
    });
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  if (isDevelopment) {
    window.loadURL("http://127.0.0.1:1420");
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  logFile = path.join(app.getPath("logs"), "moon-debug.jsonl");
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  log("app:ready", {
    isPackaged: app.isPackaged,
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    logFile,
  });
  ipcMain.handle("moon:debug-info", () => ({
    isPackaged: app.isPackaged,
    appVersion: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    logFile,
    userData: app.getPath("userData"),
  }));
  ipcMain.on("moon:set-titlebar-theme", (event, theme) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const colors = TITLE_BAR_THEMES[theme] || TITLE_BAR_THEMES.light;
    window?.setTitleBarOverlay({ ...colors, height: 32 });
  });
  ipcMain.handle("moon:get-fullscreen", (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false;
  });
  ipcMain.handle("moon:set-fullscreen", (event, value) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return false;
    window.setFullScreen(Boolean(value));
    return window.isFullScreen();
  });
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
