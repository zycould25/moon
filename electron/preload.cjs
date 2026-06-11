const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("moonElectron", {
  getDebugInfo: () => ipcRenderer.invoke("moon:debug-info"),
});
