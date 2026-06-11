const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("moonElectron", {
  getDebugInfo: () => ipcRenderer.invoke("moon:debug-info"),
  setTitlebarTheme: (theme) => ipcRenderer.send("moon:set-titlebar-theme", theme),
  getFullscreen: () => ipcRenderer.invoke("moon:get-fullscreen"),
  setFullscreen: (value) => ipcRenderer.invoke("moon:set-fullscreen", value),
  onFullscreenChange: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("moon:fullscreen-changed", listener);
    return () => ipcRenderer.removeListener("moon:fullscreen-changed", listener);
  },
});
