import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { execSync } from 'child_process';
import { GitObject, parseCommitObject, ParsedCommitObject, ParsedTreeObject } from "./git-shared-utils.js";

// Promisify zlib functions
const inflateAsync = promisify(zlib.inflate);

// Enhanced git object with resolved references
export interface EnhancedGitObject extends GitObject {
  parsedCommit?: ParsedCommitObject;
  parsedTree?: ParsedTreeObject;
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
            // Format: <mode> <type> <hash>\t<n>
            const parts = line.split('\t');
            const name = parts[1];
            const headParts = parts[0].split(' ');
            const mode = headParts[0];
            const type = headParts[1];
            const hash = headParts[2];

            return { mode, type, hash, name };
          });

        object.parsedTree = { entries };
      } catch (error) {
        console.error(`Error parsing tree object ${object.hash}:`, error);
      }
    } else if (object.type === 'commit') {
      // Pre-parse commit data
      object.parsedCommit = parseCommitObject(object.content);
    }
  }

  return objects;
}
