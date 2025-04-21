import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { execSync } from 'child_process';

// Promisify zlib functions
const inflateAsync = promisify(zlib.inflate);

// Interface for Git object
export interface GitObject {
  type: string;       // 'blob', 'tree', 'commit', or 'tag'
  hash: string;       // SHA-1 hash
  size: number;       // Size in bytes
  content: string;    // Raw content as string
}

// Check if the current directory is a Git repository
export function isGitRepository(dir: string = process.cwd()): boolean {
  const gitDir = path.join(dir, '.git');
  return fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory();
}

// List all object hashes in the Git repository
export function listObjects(dir: string = process.cwd()): string[] {
  const objectsDir = path.join(dir, '.git', 'objects');

  if (!fs.existsSync(objectsDir)) {
    return [];
  }

  const objects: string[] = [];

  // Read directory contents, excluding info and pack directories
  const entries = fs.readdirSync(objectsDir);

  for (const entry of entries) {
    if (entry === 'info' || entry === 'pack') continue;

    const subdir = path.join(objectsDir, entry);
    if (fs.statSync(subdir).isDirectory()) {
      const files = fs.readdirSync(subdir);
      for (const file of files) {
        objects.push(entry + file);
      }
    }
  }

  return objects;
}

// Read a Git object by its hash
export async function readObject(hash: string, dir: string = process.cwd()): Promise<GitObject | null> {
  const objectPath = path.join(dir, '.git', 'objects', hash.substring(0, 2), hash.substring(2));

  if (!fs.existsSync(objectPath)) {
    return null;
  }

  try {
    // Read and decompress the object
    const compressed = fs.readFileSync(objectPath);
    const buffer = await inflateAsync(compressed);
    const content = buffer.toString('utf8');

    // Find the null byte that separates header from content
    const nullByteIndex = content.indexOf('\0');
    if (nullByteIndex === -1) {
      throw new Error('Invalid Git object format');
    }

    // Parse header (format: "type size\0content")
    const header = content.substring(0, nullByteIndex);
    const [type, sizeStr] = header.split(' ');
    const size = parseInt(sizeStr, 10);

    // Extract actual content
    const objectContent = content.substring(nullByteIndex + 1);

    return {
      type,
      hash,
      size,
      content: objectContent,
    };
  } catch (error) {
    console.error(`Error reading Git object ${hash}:`, error);
    return null;
  }
}

// Enhanced git object with resolved references
export interface EnhancedGitObject extends GitObject {
  parsedContent?: any;  // For trees and commits, contains parsed content
}

// Get all Git objects with their details and resolved references
export async function getAllObjects(dir: string = process.cwd()): Promise<EnhancedGitObject[]> {
  // First collect all objects
  const hashes = listObjects(dir);
  const objects: EnhancedGitObject[] = [];

  // Create a hash map for quick lookup
  const objectMap = new Map<string, EnhancedGitObject>();

  // First pass: load all objects
  for (const hash of hashes) {
    const object = await readObject(hash, dir);
    if (object) {
      const enhancedObject: EnhancedGitObject = { ...object };
      objects.push(enhancedObject);
      objectMap.set(hash, enhancedObject);
    }
  }

  // Also load packed objects
  try {
    // Get a list of all objects using git command
    const allObjectsOutput = execSync('git rev-list --objects --all', { cwd: dir }).toString();
    const allHashesSet = new Set(allObjectsOutput.split('\n')
      .map(line => line.trim().split(' ')[0])
      .filter(hash => hash && hash.length === 40));

    // Add objects from git command that weren't in the loose objects
    for (const hash of allHashesSet) {
      if (!objectMap.has(hash)) {
        try {
          // Use git cat-file to get object info
          const typeOutput = execSync(`git cat-file -t ${hash}`, { cwd: dir }).toString().trim();
          const sizeOutput = execSync(`git cat-file -s ${hash}`, { cwd: dir }).toString().trim();
          const contentOutput = execSync(`git cat-file -p ${hash}`, { cwd: dir }).toString();

          const enhancedObject: EnhancedGitObject = {
            type: typeOutput,
            hash: hash,
            size: parseInt(sizeOutput, 10),
            content: contentOutput
          };

          objects.push(enhancedObject);
          objectMap.set(hash, enhancedObject);
        } catch (error) {
          console.error(`Error reading packed object ${hash}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('Error reading packed objects:', error);
  }

  // Second pass: parse and enhance objects with pre-processed content
  for (const object of objects) {
    if (object.type === 'tree') {
      // Pre-parse tree entries on the server side
      try {
        // Get parsed entries with proper hash values directly from git
        const treeListingOutput = execSync(`git ls-tree ${object.hash}`, { cwd: dir }).toString();
        const entries = treeListingOutput.split('\n')
          .filter(line => line.trim())
          .map(line => {
            // Format: <mode> <type> <hash>\t<name>
            const parts = line.split('\t');
            const name = parts[1];
            const headParts = parts[0].split(' ');
            const mode = headParts[0];
            const type = headParts[1];
            const hash = headParts[2];

            return { mode, type, hash, name };
          });

        object.parsedContent = { entries };
      } catch (error) {
        console.error(`Error parsing tree object ${object.hash}:`, error);
      }
    } else if (object.type === 'commit') {
      // Pre-parse commit data
      object.parsedContent = parseCommitObject(object.content);
    }
  }

  return objects;
}

// Parse a Git tree object into a more usable format
export function parseTreeObject(content: string): { mode: string; type: string; hash: string; name: string }[] {
  const result: { mode: string; type: string; hash: string; name: string }[] = [];
  let pos = 0;

  while (pos < content.length) {
    // Find the space after the mode
    const spaceIndex = content.indexOf(' ', pos);
    if (spaceIndex === -1) break;

    const mode = content.substring(pos, spaceIndex);
    pos = spaceIndex + 1;

    // Find the null byte after the file name
    const nullByteIndex = content.indexOf('\0', pos);
    if (nullByteIndex === -1) break;

    const name = content.substring(pos, nullByteIndex);
    pos = nullByteIndex + 1;

    // Create a Buffer from the binary hash bytes
    const hashBuffer = Buffer.from(content.substring(pos, pos + 20), 'binary');
    // Convert buffer to hex string
    const hashHex = hashBuffer.toString('hex');
    pos += 20;

    // Determine type from mode
    let type;
    if (mode === '40000' || mode === '040000' || mode === '0000') {
      type = 'tree';
    } else if (mode.startsWith('100') || mode === '0644' || mode === '00644') {
      type = 'blob';
    } else if (mode === '160000') {
      type = 'commit'; // submodule
    } else if (mode === '120000') {
      type = 'blob';   // symlink
    } else {
      type = 'unknown';
    }

    result.push({ mode, type, hash: hashHex, name });
  }

  return result;
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
