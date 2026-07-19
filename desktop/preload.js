// Bridges the web UI (app.js) to the Electron main process so the popover can slide
// in a native wait-card and cards can dismiss themselves. Context-isolated.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("spotter", {
  openWaitCard: (skillId) => ipcRenderer.send("open-wait-card", skillId),
  dismissWaitCard: () => ipcRenderer.send("dismiss-wait-card"),
});
