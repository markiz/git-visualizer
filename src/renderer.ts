// Type definition for our Electron bridge
/// <reference path="./electron.d.ts" />

// Path module for handling file paths
const path = {
  sep: '/' // Simple path separator implementation for browser context
};

// Git object interface
interface GitObject {
  type: string;
  hash: string;
  size: number;
  content: string;
}

// Tree entry interface
interface TreeEntry {
  mode: string;
  type: string;
  hash: string;
  name: string;
}

// DOM Elements
let repoStatus: HTMLElement;
let objectsList: HTMLElement;
let objectDetails: HTMLElement;
let refreshBtn: HTMLElement;
let selectRepoBtn: HTMLElement;
let objectTypeFilter: HTMLSelectElement;
let objectCount: HTMLElement;
let searchInput: HTMLInputElement;
let searchBtn: HTMLElement;

// Global state
let gitObjects: GitObject[] = [];
let selectedObjectHash: string | null = null;

// Clean up event listeners when the page is unloaded
window.addEventListener('beforeunload', () => {
  window.electron.ipcRenderer.removeAllListeners('git-objects');
  window.electron.ipcRenderer.removeAllListeners('repository-changed');
  window.electron.ipcRenderer.removeAllListeners('repository-error');
});

// Initialize UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Get DOM elements
  repoStatus = document.getElementById('repo-status')!;
  objectsList = document.getElementById('objects-list')!;
  objectDetails = document.getElementById('object-details')!;
  refreshBtn = document.getElementById('refresh-btn')!;
  selectRepoBtn = document.getElementById('select-repo-btn')!;
  objectTypeFilter = document.getElementById('object-type-filter') as HTMLSelectElement;
  objectCount = document.getElementById('object-count')!;
  searchInput = document.getElementById('search-input') as HTMLInputElement;
  searchBtn = document.getElementById('search-btn')!;

  // Set up event listeners
  setupEventListeners();

  // Initial state
  repoStatus.textContent = 'Loading repository...';

  // Request git objects on page load
  window.electron.ipcRenderer.send('refresh-git-objects');
});

// Set up event listeners
function setupEventListeners(): void {
  // Refresh button
  refreshBtn.addEventListener('click', () => {
    repoStatus.textContent = 'Refreshing repository...';
    window.electron.ipcRenderer.send('refresh-git-objects');
  });

  // Select repository button
  selectRepoBtn.addEventListener('click', () => {
    repoStatus.textContent = 'Selecting repository...';
    window.electron.ipcRenderer.send('select-repository');
  });

  // Type filter
  objectTypeFilter.addEventListener('change', () => {
    renderObjectsList(gitObjects);
  });

  // Search functionality
  searchBtn.addEventListener('click', () => {
    renderObjectsList(gitObjects);
  });

  searchInput.addEventListener('keyup', (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      renderObjectsList(gitObjects);
    }
  });

  // Receive Git objects from main process
  window.electron.ipcRenderer.on('git-objects', (objects: GitObject[]) => {
    gitObjects = objects;

    if (objects.length === 0) {
      repoStatus.textContent = 'No Git objects found.';
      objectsList.innerHTML = '<p>No objects available.</p>';
      return;
    }

    repoStatus.textContent = `Repository loaded with ${objects.length} objects.`;
    renderObjectsList(objects);
  });

  // Handle repository change event
  window.electron.ipcRenderer.on('repository-changed', (repoPath: string) => {
    // Extract repository name from path
    const repoName = repoPath.split(path.sep).pop() || repoPath;
    repoStatus.textContent = `Selected repository: ${repoName}`;
    // Clear previous data
    objectsList.innerHTML = '<p>Loading objects...</p>';
    objectDetails.innerHTML = '<p>Select an object to view its details</p>';
  });

  // Handle repository error event
  window.electron.ipcRenderer.on('repository-error', (errorMessage: string) => {
    repoStatus.textContent = errorMessage;
    objectsList.innerHTML = '<p>No repository loaded.</p>';
    objectDetails.innerHTML = '<p>No objects available.</p>';
  });
}

// Parse tree content for display
function parseTreeContent(content: string): TreeEntry[] {
  try {
    const entries: TreeEntry[] = [];
    let pos = 0;

    while (pos < content.length) {
      const spaceIndex = content.indexOf(' ', pos);
      if (spaceIndex === -1) break;

      const mode = content.substring(pos, spaceIndex);
      pos = spaceIndex + 1;

      const nullIndex = content.indexOf('\0', pos);
      if (nullIndex === -1) break;

      const name = content.substring(pos, nullIndex);
      pos = nullIndex + 1;

      // Extract 20-byte SHA-1 and convert to hex
      const hash = Array.from(content.substring(pos, pos + 20))
        .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('');
      pos += 20;

      // Determine type from mode
      let type: string;
      if (mode === '40000' || mode === '0000' || mode === '040000') {
        type = 'tree';
      } else if (mode === '100644' || mode === '100664' || mode === '100755' || mode === '0644' || mode === '00644') {
        type = 'blob';
      } else if (mode === '160000') {
        type = 'commit'; // submodule
      } else if (mode === '120000') {
        type = 'blob';   // symlink
      } else {
        type = 'unknown';
      }

      entries.push({ mode, type, hash, name });
    }

    return entries;
  } catch (error) {
    console.error('Error parsing tree content:', error);
    return [];
  }
}

// Format commit content for display
function formatCommitContent(content: string): string {
  const lines = content.split('\n');
  let html = '<div>';

  // Extract headers and message
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line === '') break;

    const spaceIndex = line.indexOf(' ');
    if (spaceIndex !== -1) {
      const key = line.substring(0, spaceIndex);
      const value = line.substring(spaceIndex + 1);

      if (key === 'tree' || key === 'parent') {
        html += `<div><strong>${key}:</strong> <span class="tree">${value}</span></div>`;
      } else {
        html += `<div><strong>${key}:</strong> ${value}</div>`;
      }
    }
  }

  html += '<hr>';

  // Add commit message
  if (i < lines.length - 1) {
    const message = lines.slice(i + 1).join('<br>');
    html += `<div><strong>Message:</strong><br>${message}</div>`;
  }

  html += '</div>';
  return html;
}

// Display object details
function showObjectDetails(object: GitObject): void {
  let detailsHtml = `
    <h3>Object: ${object.hash}</h3>
    <div><strong>Type:</strong> <span class="${object.type}">${object.type}</span></div>
    <div><strong>Size:</strong> ${object.size} bytes</div>
    <hr>
  `;

  if (object.type === 'tree') {
    const entries = parseTreeContent(object.content);
    detailsHtml += '<h4>Tree Entries:</h4><ul>';

    entries.forEach(entry => {
      detailsHtml += `
        <li>
          <span class="${entry.type}">${entry.type}</span>
          <strong>${entry.name}</strong>
          (mode: ${entry.mode}, hash: ${entry.hash})
        </li>
      `;
    });

    detailsHtml += '</ul>';
  } else if (object.type === 'commit') {
    detailsHtml += formatCommitContent(object.content);
  } else {
    detailsHtml += `
      <h4>Content:</h4>
      <pre>${escapeHtml(object.content)}</pre>
    `;
  }

  objectDetails.innerHTML = detailsHtml;
}

// Helper to escape HTML
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Render list of objects
function renderObjectsList(objects: GitObject[]): void {
  const currentFilter = objectTypeFilter.value;
  const searchTerm = searchInput.value.toLowerCase().trim();

  // Apply type filter
  let filteredObjects = currentFilter === 'all'
    ? objects
    : objects.filter(obj => obj.type === currentFilter);

  // Apply search filter if search term exists
  if (searchTerm) {
    filteredObjects = filteredObjects.filter(obj =>
      // Search by hash
      obj.hash.toLowerCase().includes(searchTerm) ||
      // Search by content (limited for performance)
      obj.content.toLowerCase().includes(searchTerm)
    );
  }

  objectCount.textContent = `(${filteredObjects.length} objects)`;

  if (filteredObjects.length === 0) {
    objectsList.innerHTML = '<p>No objects found.</p>';
    return;
  }

  let listHtml = '';

  filteredObjects.forEach(object => {
    const isSelected = object.hash === selectedObjectHash;
    listHtml += `
      <div class="object-item ${isSelected ? 'selected' : ''}" data-hash="${object.hash}">
        <span class="${object.type}">${object.type}</span>
        <strong>${object.hash.substring(0, 8)}</strong>
        <span>${object.size} bytes</span>
      </div>
    `;
  });

  objectsList.innerHTML = listHtml;

  // Add click events
  document.querySelectorAll('.object-item').forEach(item => {
    item.addEventListener('click', () => {
      const hash = item.getAttribute('data-hash');
      if (hash) {
        selectedObjectHash = hash;

        // Update selection
        document.querySelectorAll('.object-item').forEach(el => {
          el.classList.remove('selected');
        });
        item.classList.add('selected');

        // Show details
        const selectedObject = gitObjects.find(obj => obj.hash === hash);
        if (selectedObject) {
          showObjectDetails(selectedObject);
        }
      }
    });
  });
}
