const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("moonElectron", {
  getDebugInfo: () => ipcRenderer.invoke("moon:debug-info"),
  setTitlebarTheme: (theme) => ipcRenderer.send("moon:set-titlebar-theme", theme),
  getFullscreen: () => ipcRenderer.invoke("moon:get-fullscreen"),
  setFullscreen: (value) => ipcRenderer.invoke("moon:set-fullscreen", value),
  inspectEpub: (file, bookId) => {
    const filePath = webUtils.getPathForFile(file);
    if (!filePath) return Promise.reject(new Error("The selected EPUB has no local file path"));
    return ipcRenderer.invoke("moon:epub-inspect", filePath, bookId);
  },
  prepareEpubForReading: (bookId) => ipcRenderer.invoke("moon:epub-prepare", bookId),
  removeEpubArtifacts: (bookId) => ipcRenderer.invoke("moon:epub-remove-artifacts", bookId),
  onFullscreenChange: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("moon:fullscreen-changed", listener);
    return () => ipcRenderer.removeListener("moon:fullscreen-changed", listener);
  },
});
