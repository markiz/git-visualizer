import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'electron', {
    ipcRenderer: {
      send: (channel: string, ...args: any[]) => {
        // Whitelist channels
        const validChannels = ['refresh-git-objects', 'select-repository'];
        if (validChannels.includes(channel)) {
          ipcRenderer.send(channel, ...args);
        }
      },
      on: (channel: string, func: (...args: any[]) => void) => {
        // Whitelist channels
        const validChannels = [
          'git-objects',
          'repository-changed',
          'repository-error'
        ];
        if (validChannels.includes(channel)) {
          // Strip event as it includes `sender` and is a security risk
          ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
      },
      removeAllListeners: (channel: string) => {
        const validChannels = [
          'git-objects',
          'repository-changed',
          'repository-error'
        ];
        if (validChannels.includes(channel)) {
          ipcRenderer.removeAllListeners(channel);
        }
      }
    }
  }
);
