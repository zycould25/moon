const { app, BrowserWindow, ipcMain, Menu, protocol, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

protocol.registerSchemesAsPrivileged([{
  scheme: "moon-epub",
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
  },
}]);

const isDevelopment = !app.isPackaged;
app.commandLine.appendSwitch("enable-logging");
app.commandLine.appendSwitch("v", "1");

let logFile;
let epubNative;

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

function nativeModule() {
  if (!epubNative) {
    const modulePath = path.join(
      __dirname,
      "native",
      `${process.platform}-${process.arch}`,
      "moon_epub_node.node",
    );
    epubNative = require(modulePath);
    log("epub-native:loaded", { modulePath });
  }
  return epubNative;
}

function epubRoots() {
  const root = path.join(app.getPath("userData"), "epub-core");
  return {
    artifacts: path.join(root, "artifacts"),
    books: path.join(root, "books"),
    covers: path.join(root, "covers"),
  };
}

function assertBookId(bookId) {
  if (typeof bookId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(bookId)) {
    throw new Error("Invalid book id");
  }
}

function managedEpubPath(booksRoot, bookId) {
  assertBookId(bookId);
  return path.join(booksRoot, `${bookId}.epub`);
}

function unwrapNativeResult(json) {
  const envelope = JSON.parse(json);
  if (!envelope?.ok) {
    const error = new Error(envelope?.error?.message || "Unknown native EPUB error");
    error.code = envelope?.error?.code || "native_error";
    throw error;
  }
  return envelope.value;
}

async function dataUrlForCover(coverPath) {
  if (!coverPath) return null;
  const mimeTypes = {
    ".avif": "image/avif",
    ".gif": "image/gif",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
  };
  const mimeType = mimeTypes[path.extname(coverPath).toLowerCase()] || "application/octet-stream";
  return `data:${mimeType};base64,${(await fs.promises.readFile(coverPath)).toString("base64")}`;
}

function mimeTypeForResource(filePath) {
  const mimeTypes = {
    ".avif": "image/avif",
    ".css": "text/css; charset=utf-8",
    ".gif": "image/gif",
    ".htm": "text/html; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".ncx": "application/x-dtbncx+xml",
    ".otf": "font/otf",
    ".opf": "application/oebps-package+xml",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ttf": "font/ttf",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".xhtml": "application/xhtml+xml; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
  };
  return mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function nativePackageUrl(bookId, packagePath, artifactsRoot) {
  const bookRoot = path.resolve(artifactsRoot, bookId);
  const relativePath = path.relative(bookRoot, path.resolve(packagePath));
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Native EPUB package escaped its cache directory");
  }
  const encodedPath = relativePath.split(path.sep).map(encodeURIComponent).join("/");
  return `moon-epub://library/${encodeURIComponent(bookId)}/${encodedPath}`;
}

function registerEpubProtocol() {
  protocol.handle("moon-epub", async (request) => {
    try {
      const requestUrl = new URL(request.url);
      if (requestUrl.host !== "library") return new Response("Not found", { status: 404 });
      const segments = requestUrl.pathname.split("/").filter(Boolean).map(decodeURIComponent);
      const [bookId, ...resourceSegments] = segments;
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(bookId || "") || resourceSegments.length === 0) {
        return new Response("Bad request", { status: 400 });
      }
      const { artifacts } = epubRoots();
      const bookRoot = path.resolve(artifacts, bookId);
      const resourcePath = path.resolve(bookRoot, ...resourceSegments);
      if (!resourcePath.startsWith(`${bookRoot}${path.sep}`)) {
        return new Response("Forbidden", { status: 403 });
      }
      const data = await fs.promises.readFile(resourcePath);
      return new Response(data, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": mimeTypeForResource(resourcePath),
        },
      });
    } catch (error) {
      if (error?.code !== "ENOENT") log("epub-protocol:error", { message: String(error) });
      return new Response("Not found", { status: 404 });
    }
  });
}

function registerEpubIpc() {
  // Load eagerly so a missing/wrong-architecture packaged module fails at
  // startup instead of waiting until the user's first import.
  nativeModule();
  ipcMain.handle("moon:epub-inspect", async (_event, epubPath, bookId) => {
    assertBookId(bookId);
    if (typeof epubPath !== "string" || !path.isAbsolute(epubPath)) {
      throw new Error("Invalid EPUB path");
    }
    const sourceStat = await fs.promises.stat(epubPath);
    if (!sourceStat.isFile()) throw new Error("The selected EPUB is not a file");

    const { books, covers } = epubRoots();
    const destination = managedEpubPath(books, bookId);
    const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
    await fs.promises.mkdir(books, { recursive: true });
    try {
      await fs.promises.copyFile(epubPath, temporary);
      await fs.promises.rename(temporary, destination);
      const value = unwrapNativeResult(
        await nativeModule().inspectJson(destination, covers, bookId),
      );
      const { coverPath, ...metadata } = value;
      return {
        ...metadata,
        coverBase64: await dataUrlForCover(coverPath),
        nativeStorage: true,
      };
    } catch (error) {
      await Promise.allSettled([
        fs.promises.rm(destination, { force: true }),
        nativeModule()
          .removeArtifactsJson(epubRoots().artifacts, covers, bookId)
          .then(unwrapNativeResult),
      ]);
      throw error;
    } finally {
      await fs.promises.rm(temporary, { force: true });
    }
  });
  ipcMain.handle("moon:epub-prepare", async (_event, bookId) => {
    const { artifacts, books } = epubRoots();
    const epubPath = managedEpubPath(books, bookId);
    const packagePath = unwrapNativeResult(
      await nativeModule().prepareJson(epubPath, artifacts, bookId),
    );
    return { packageUrl: nativePackageUrl(bookId, packagePath, artifacts) };
  });
  ipcMain.handle("moon:epub-remove-artifacts", async (_event, bookId) => {
    const { artifacts, books, covers } = epubRoots();
    const epubPath = managedEpubPath(books, bookId);
    await Promise.all([
      nativeModule()
        .removeArtifactsJson(artifacts, covers, bookId)
        .then(unwrapNativeResult),
      fs.promises.rm(epubPath, { force: true }),
    ]);
  });
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
  registerEpubProtocol();
  registerEpubIpc();
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
    if (typeof window?.setTitleBarOverlay === "function") {
      window.setTitleBarOverlay({ ...colors, height: 32 });
    }
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
