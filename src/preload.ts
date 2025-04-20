import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'electron', {
    ipcRenderer: {
      send: (channel: string, ...args: any[]) => {
        ipcRenderer.send(channel, ...args);
      },
      on: (channel: string, func: (...args: any[]) => void) => {
        // Strip event as it includes `sender` and is a security risk
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      },
      removeAllListeners: (channel: string) => {
        ipcRenderer.removeAllListeners(channel);
      }
    }
  }
);
