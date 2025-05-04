// Shared types, functions, and interfaces

// Interface for Git object
export interface GitObject {
  type: string;       // 'blob', 'tree', 'commit', or 'tag'
  hash: string;       // SHA-1 hash
  size: number;       // Size in bytes
  content: string;    // Raw content as string
}

// Tree entry interface
export interface TreeEntry {
  mode: string;
  type: string;
  hash: string;
  name: string;
}

// Parse a Git commit object into a more usable format
export function parseCommitObject(content: string): Record<string, string | string[]> {
  const lines = content.split('\n');
  const result: Record<string, string | string[]> = {
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

      // Handle parent commits (can be multiple)
      if (key === 'parent') {
        if (!result.parent) {
          result.parent = [value];
        } else if (Array.isArray(result.parent)) {
          (result.parent as string[]).push(value);
        }
      } else {
        result[key] = value;
      }
    }
  }

  // Parse commit message
  if (i < lines.length - 1) {
    result.message = lines.slice(i + 1).join('\n');
  }

  return result;
}
