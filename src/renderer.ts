// Type definition for our Electron bridge
/// <reference path="./electron.d.ts" />

import { parseTreeContent, formatCommitContent, extractDateFromAuthor } from './git-renderer-utils.js';
import { GitObject, TreeEntry, ParsedCommitObject, ParsedTreeObject } from './git-shared-utils.js';
import { EnhancedGitObject } from './git-utils.js';

// Path module for handling file paths
const path = {
  sep: '/' // Simple path separator implementation for browser context
};

// DOM Elements
let repoStatus: HTMLElement;
let objectsList: HTMLElement;
let objectDetails: HTMLElement;
let refreshBtn: HTMLElement;
let selectRepoBtn: HTMLElement;
let objectTypeFilter: HTMLSelectElement;
let searchInput: HTMLInputElement;
let searchBtn: HTMLElement;
let sortSelect: HTMLSelectElement;

// Global state
let gitObjects: GitObject[] = [];
let selectedObjectHash: string | null = null;
let filteredObjectsList: GitObject[] = []; // Store the filtered list for keyboard navigation

// Clean up event listeners when the page is unloaded
window.addEventListener('beforeunload', () => {
  window.electron.ipcRenderer.removeAllListeners('git-objects');
  window.electron.ipcRenderer.removeAllListeners('repository-changed');
  window.electron.ipcRenderer.removeAllListeners('repository-error');
});

// Handle keyboard navigation with arrow keys
function handleKeyboardNavigation(event: KeyboardEvent): void {
  // Only handle if we have objects and an active selection
  if (!filteredObjectsList.length || !selectedObjectHash) return;

  // Only process keyboard navigation when the objects list has focus
  // or when the details panel has focus (for navigating while reading details)
  const activeElement = document.activeElement;
  const isListFocused = objectsList.contains(activeElement) ||
                        activeElement === objectsList ||
                        objectDetails.contains(activeElement) ||
                        activeElement === objectDetails ||
                        activeElement === document.body;

  if (!isListFocused) return;

  // Find the currently selected object index
  const currentIndex = filteredObjectsList.findIndex(obj => obj.hash === selectedObjectHash);
  if (currentIndex === -1) return;

  let newIndex = currentIndex;

  // Handle arrow key navigation
  switch (event.key) {
    case 'ArrowUp':
      event.preventDefault();
      newIndex = Math.max(0, currentIndex - 1);
      break;
    case 'ArrowDown':
      event.preventDefault();
      newIndex = Math.min(filteredObjectsList.length - 1, currentIndex + 1);
      break;
    case 'Enter':
      // If Enter is pressed, just focus on the details panel
      event.preventDefault();
      objectDetails.focus();
      return;
  }

  // If we've moved to a different object, select it
  if (newIndex !== currentIndex) {
    const newObject = filteredObjectsList[newIndex];
    selectedObjectHash = newObject.hash;

    // Update UI selection
    document.querySelectorAll('.object-item').forEach(el => {
      el.classList.remove('selected');
    });

    const newSelectedItem = document.querySelector(`.object-item[data-hash="${newObject.hash}"]`);
    if (newSelectedItem) {
      newSelectedItem.classList.add('selected');
      newSelectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Show details
    showObjectDetails(newObject);
  }
}

// Initialize UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Get DOM elements
  repoStatus = document.getElementById('repo-status')!;
  objectsList = document.getElementById('objects-list')!;
  objectDetails = document.getElementById('object-details')!;
  refreshBtn = document.getElementById('refresh-btn')!;
  selectRepoBtn = document.getElementById('select-repo-btn')!;
  objectTypeFilter = document.getElementById('object-type-filter') as HTMLSelectElement;
  searchInput = document.getElementById('search-input') as HTMLInputElement;
  searchBtn = document.getElementById('search-btn')!;
  sortSelect = document.getElementById('sort-select') as HTMLSelectElement;

  // Set up event listeners
  setupEventListeners();

  // Add keyboard navigation
  document.addEventListener('keydown', handleKeyboardNavigation);

  // Auto-focus list containers when clicked anywhere inside
  objectsList.addEventListener('click', (event) => {
    if (event.target !== document.activeElement) {
      objectsList.focus();
    }
  });

  objectDetails.addEventListener('click', (event) => {
    if (event.target !== document.activeElement) {
      objectDetails.focus();
    }
  });

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

  // Sort selector
  sortSelect.addEventListener('change', () => {
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
  window.electron.ipcRenderer.on('git-objects', (objects: EnhancedGitObject[]) => {
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



// Display object details
function showObjectDetails(object: EnhancedGitObject): void {
  let detailsHtml = `
    <h3>Object: ${object.hash}</h3>
    <div><strong>Type:</strong> <span class="${object.type}">${object.type}</span></div>
    <div><strong>Size:</strong> ${object.size} bytes</div>
    <hr>
  `;

  if (object.type === 'tree') {
    // Use parsed content from server if available
    // Ensure content is a Buffer before passing to parseTreeContent
    const entries = object.parsedTree?.entries || parseTreeContent(object.content as Buffer);
    detailsHtml += '<h4>Tree Entries:</h4><ul>';

    entries.forEach((entry: { type: string; name: string; mode: string; hash: string }) => {
      detailsHtml += `
        <li>
          <span class="${entry.type}">${entry.type}</span>
          <strong>${entry.name}</strong>
          (mode: ${entry.mode}, hash: <a href="#" class="hash-link" data-hash="${entry.hash}">${entry.hash}</a>)
        </li>
      `;
    });

    detailsHtml += '</ul>';
  } else if (object.type === 'commit') {
    // Ensure content is a string before passing to formatCommitContent
    detailsHtml += formatCommitContent(object.content.toString('utf8'), object.parsedCommit);
  } else if (object.type === 'blob' && object.isBinary) {
    // Display placeholder for binary blobs
    detailsHtml += `
      <h4>Content:</h4>
      <p>Binary object - content not displayed.</p>
    `;
  }
  else {
    // Display content for non-binary blobs and other types
    // Ensure content is a string before escaping and displaying
    detailsHtml += `
      <h4>Content:</h4>
      <pre>${escapeHtml(object.content.toString('utf8'))}</pre>
    `;
  }

  objectDetails.innerHTML = detailsHtml;

  // Add click event listeners for hash links
  objectDetails.querySelectorAll('.hash-link').forEach(link => {
    // Add click handler
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const hash = (event.currentTarget as HTMLElement).getAttribute('data-hash');
      navigateToHash(hash);
    });

    // Add keydown handler for Enter key with proper type handling
    link.addEventListener('keydown', (event) => {
      if (event instanceof KeyboardEvent && event.key === 'Enter') {
        event.preventDefault();
        const hash = (event.currentTarget as HTMLElement).getAttribute('data-hash');
        navigateToHash(hash);
      }
    });

    // Make the links keyboard focusable
    link.setAttribute('tabindex', '0');
  });
}

// Function to navigate to a specific hash
function navigateToHash(hash: string | null): void {
  if (hash) {
    console.log('Navigating to hash:', hash);
    // Debug logging to see what's available
    console.log('First few available hashes:', gitObjects.slice(0, 5).map(obj => obj.hash));

    // Find the object with this hash
    const linkedObject = gitObjects.find(obj => obj.hash.toLowerCase() === hash.toLowerCase());
    if (linkedObject) {
      // Update selected hash
      selectedObjectHash = hash;

      // Show details for the linked object
      showObjectDetails(linkedObject);

      // Update selection in the list if visible
      const listItem = document.querySelector(`.object-item[data-hash="${hash}"]`);
      if (listItem) {
        document.querySelectorAll('.object-item').forEach(el => {
          el.classList.remove('selected');
        });
        listItem.classList.add('selected');

        // Scroll the item into view
        listItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } else {
      console.error(`Object with hash ${hash} not found. Available hashes:`,
        gitObjects.map(obj => obj.hash).slice(0, 10)); // Show first 10 hashes for debugging
      alert(`Object with hash ${hash} not found in the current repository view.`);
    }
  }
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
function renderObjectsList(objects: EnhancedGitObject[]): void {
  const currentFilter = objectTypeFilter.value;
  const searchTerm = searchInput.value.toLowerCase().trim();
  const sortMethod = sortSelect.value;

  // Apply type filter
  let filteredObjects = currentFilter === 'all'
    ? objects
    : objects.filter(obj => obj.type === currentFilter);

  // Apply search filter if search term exists
  if (searchTerm) {
    filteredObjects = filteredObjects.filter(obj =>
      // Search by hash
      obj.hash.toLowerCase().includes(searchTerm) ||
      // Search by content (limited for performance) - convert Buffer to string for search
      (obj.content as Buffer).toString('utf8').toLowerCase().includes(searchTerm)
    );
  }

  // Apply sorting
  if (sortMethod !== 'none') {
    filteredObjects = [...filteredObjects]; // Create a copy to avoid modifying the original array

    switch (sortMethod) {
      case 'date-desc':
        filteredObjects.sort((a, b) => {
          // Only for commit objects that have parsedCommit
          if (a.type === 'commit' && b.type === 'commit') {
            const dateA = a.parsedCommit?.author ? extractDateFromAuthor(a.parsedCommit.author) : 0;
            const dateB = b.parsedCommit?.author ? extractDateFromAuthor(b.parsedCommit.author) : 0;
            return dateB - dateA; // Newest first
          }
          // Keep non-commits at the end
          if (a.type === 'commit') return -1;
          if (b.type === 'commit') return 1;
          return 0;
        });
        break;

      case 'date-asc':
        filteredObjects.sort((a, b) => {
          // Only for commit objects that have parsedCommit
          if (a.type === 'commit' && b.type === 'commit') {
            const dateA = a.parsedCommit?.author ? extractDateFromAuthor(a.parsedCommit.author) : 0;
            const dateB = b.parsedCommit?.author ? extractDateFromAuthor(b.parsedCommit.author) : 0;
            return dateA - dateB; // Oldest first
          }
          // Keep non-commits at the end
          if (a.type === 'commit') return -1;
          if (b.type === 'commit') return 1;
          return 0;
        });
        break;

      case 'type':
        filteredObjects.sort((a, b) => a.type.localeCompare(b.type));
        break;

      case 'size-desc':
        filteredObjects.sort((a, b) => b.size - a.size);
        break;

      case 'size-asc':
        filteredObjects.sort((a, b) => a.size - b.size);
        break;
    }
  }

  // Store the filtered list for keyboard navigation
  filteredObjectsList = filteredObjects;


  if (filteredObjects.length === 0) {
    objectsList.innerHTML = '<p>No objects found.</p>';
    return;
  }

  let listHtml = '';

  filteredObjects.forEach(object => {
    const isSelected = object.hash === selectedObjectHash;
    // Add date info for commits when sorting by date
    let dateInfo = '';
    if (object.type === 'commit' && (sortMethod === 'date-desc' || sortMethod === 'date-asc') && object.parsedCommit?.author) {
      const date = extractDateFromAuthor(object.parsedCommit.author);
      if (date) {
        const formattedDate = new Date(date * 1000).toLocaleDateString();
        dateInfo = ` <span style="color:#888;">${formattedDate}</span>`;
      }
    }

    listHtml += `
      <div class="object-item ${isSelected ? 'selected' : ''}" data-hash="${object.hash}">
        <span class="${object.type}">${object.type}</span>
        <strong>${object.hash.substring(0, 8)}</strong>${dateInfo}
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
        console.log('Clicked on hash:', hash);
        // Debug logging to see what's available
        console.log('First few available hashes:', gitObjects.slice(0, 5).map(obj => obj.hash));

        // Find the object with this hash
        const linkedObject = gitObjects.find(obj => obj.hash.toLowerCase() === hash.toLowerCase());
        if (linkedObject) {
          selectedObjectHash = hash;

          // Update selection
          document.querySelectorAll('.object-item').forEach(el => {
            el.classList.remove('selected');
          });
          item.classList.add('selected');

          // Show details
          showObjectDetails(linkedObject);
        } else {
          console.error(`Object with hash ${hash} not found. Available hashes:`,
            gitObjects.map(obj => obj.hash).slice(0, 10)); // Show first 10 hashes for debugging
          alert(`Object with hash ${hash} not found in the current repository view.`);
        }
      }
    });
  });
}
