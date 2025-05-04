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

// Enhanced git object with resolved references
export class EnhancedGitObject implements GitObject {
  type: string;
  hash: string;
  size: number;
  content: Buffer;
  parsedCommit?: ParsedCommitObject;
  parsedTree?: ParsedTreeObject;
  isBinary?: boolean; // Add isBinary flag

  private _cachedContentString: string | undefined;

  constructor(gitObject: GitObject, contentString?: string) {
    this.type = gitObject.type;
    this.hash = gitObject.hash;
    this.size = gitObject.size;
    this.content = gitObject.content;
    this._cachedContentString = contentString; // Initialize with provided string
  }

  getContentString(): string {
    if (this._cachedContentString === undefined) {
      this._cachedContentString = this.content.toString('utf8');
    }
    return this._cachedContentString;
  }

  /**
   * Serializes this EnhancedGitObject instance into a plain object suitable for IPC.
   * @returns A plain object representation of the EnhancedGitObject.
   */
  toPlainObject(): any {
    return {
      type: this.type,
      hash: this.hash,
      size: this.size,
      content: this.content, // Buffer is serializable
      parsedCommit: this.parsedCommit,
      parsedTree: this.parsedTree,
      isBinary: this.isBinary,
      contentString: this.getContentString(), // Include the cached string
    };
  }

  /**
   * Deserializes a plain object received via IPC back into an EnhancedGitObject instance.
   * @param plainObj The plain object to deserialize.
   * @returns An EnhancedGitObject instance.
   */
  static fromPlainObject(plainObj: any): EnhancedGitObject {
    // In the renderer, we don't have Buffer. We rely on contentString.
    // The content property will be whatever IPC sends (likely an array).
    // The EnhancedGitObject constructor will use contentString if provided.
    const gitObject: GitObject = {
      type: plainObj.type,
      hash: plainObj.hash,
      size: plainObj.size,
      content: plainObj.content, // Keep content as received
    };
    const enhancedObject = new EnhancedGitObject(gitObject, plainObj.contentString);
    enhancedObject.parsedCommit = plainObj.parsedCommit;
    enhancedObject.parsedTree = plainObj.parsedTree;
    enhancedObject.isBinary = plainObj.isBinary;
    return enhancedObject;
  }
}
