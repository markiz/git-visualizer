// Shared types, functions, and interfaces

// Interface for Git object
export interface GitObject {
  type: string;       // 'blob', 'tree', 'commit', or 'tag'
  hash: string;       // SHA-1 hash
  size: number;       // Size in bytes
  content: Buffer;    // Raw content as Buffer
}

// Tree entry interface
export interface TreeEntry {
  mode: string;
  type: string;
  hash: string;
  name: string;
}

// Parsed commit object interface
export interface ParsedCommitObject {
  tree: string;
  parent: string | string[];
  author: string;
  committer: string;
  message: string;
}

// Parsed tree object interface
export interface ParsedTreeObject {
  entries: TreeEntry[];
}

// Parse a Git commit object into a more usable format
export function parseCommitObject(content: string): ParsedCommitObject {
  const lines = content.split('\n');
  const result: ParsedCommitObject = {
    tree: '', // Initialize with default values
    parent: [], // Initialize as array for potential multiple parents
    author: '',
    committer: '',
    message: ''
  };

  // Parse headers
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line === '') break; // Empty line separates headers from message

    const spaceIndex = line.indexOf(' ');
    if (spaceIndex !== -1) {
      const key = line.substring(0, spaceIndex);
      const value = line.substring(spaceIndex + 1);

      // Assign parsed values to the result object
      if (key === 'tree') {
        result.tree = value;
      } else if (key === 'parent') {
        // Handle parent commits (can be multiple)
        if (!Array.isArray(result.parent)) {
           result.parent = [result.parent as string]; // Convert single parent to array if needed
        }
        (result.parent as string[]).push(value);
      } else if (key === 'author') {
        result.author = value;
      } else if (key === 'committer') {
        result.committer = value;
      }
      // Ignore other header keys for now as per ParsedCommitObject definition
    }
  }

  // Ensure parent is an array if only one parent was found
  if (!Array.isArray(result.parent) && result.parent !== '') {
      result.parent = [result.parent];
  } else if (result.parent === '') {
      result.parent = []; // Ensure it's an empty array if no parents found
  }


  // Parse commit message
  if (i < lines.length - 1) {
    result.message = lines.slice(i + 1).join('\n');
  }

  return result;
}
