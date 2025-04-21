import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { isGitRepository, getAllObjects } from './git-utils';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Load the index.html of the app
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Open DevTools for debugging
  mainWindow.webContents.openDevTools();

  // Refresh Git objects when the page is reloaded
  mainWindow.webContents.on('did-finish-load', async () => {
    if (isGitRepository()) {
      try {
        const objects = await getAllObjects();
        if (mainWindow) {
          mainWindow.webContents.send('git-objects', objects);
        }
      } catch (error) {
        console.error('Error refreshing Git objects on page load:', error);
      }
    } else {
      if (mainWindow) {
        mainWindow.webContents.send('git-objects', []);
      }
    }
  });

  // Emitted when the window is closed
  mainWindow.on('closed', () => {
    // Remove all IPC listeners when the window is closed
    ipcMain.removeAllListeners('refresh-git-objects');
    mainWindow = null;
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

  // Check if current directory is a Git repository
  const isGitRepo = isGitRepository();

  if (mainWindow && isGitRepo) {
    // Get Git objects and send to renderer
    getAllObjects().then(objects => {
      if (mainWindow) {
        mainWindow.webContents.send('git-objects', objects);
      }
    }).catch(error => {
      console.error('Error getting Git objects:', error);
    });
  }
});

// Handle IPC messages
ipcMain.on('refresh-git-objects', async () => {
  if (mainWindow) {
    try {
      const objects = await getAllObjects();
      mainWindow.webContents.send('git-objects', objects);
    } catch (error) {
      console.error('Error refreshing Git objects:', error);
    }
  }
});

// Handle repository selection
ipcMain.on('select-repository', async () => {
  if (mainWindow) {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Select Git Repository'
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const selectedDir = result.filePaths[0];

        if (isGitRepository(selectedDir)) {
          // Update the current working directory for git operations
          process.chdir(selectedDir);

          // Send the repository path to the renderer
          mainWindow.webContents.send('repository-changed', selectedDir);

          // Refresh objects from the new repository
          const objects = await getAllObjects(selectedDir);
          mainWindow.webContents.send('git-objects', objects);
        } else {
          mainWindow.webContents.send('repository-error', 'The selected directory is not a Git repository.');
        }
      }
    } catch (error) {
      console.error('Error selecting repository:', error);
      if (mainWindow) {
        let errorMessage = 'An unknown error occurred';
        if (error instanceof Error) {
          errorMessage = error.message;
        } else if (typeof error === 'string') {
          errorMessage = error;
        } else if (error && typeof error === 'object' && 'message' in error) {
          errorMessage = (error as { message: string }).message;
        }
        mainWindow.webContents.send('repository-error', `Error: ${errorMessage}`);
      }
    }
  }
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
