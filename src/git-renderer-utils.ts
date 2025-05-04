// This file will contain git-related utility functions for the renderer process.

import { GitObject, TreeEntry, parseCommitObject, ParsedCommitObject } from "./git-shared-utils.js";

// Parse tree content for display
export function parseTreeContent(content: string): TreeEntry[] {
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
      // Create a binary-to-hex array manually
      const hashBytes: number[] = [];
      for (let j = 0; j < 20; j++) {
        // Get byte value safely
        const charCode = content.charCodeAt(pos + j);
        // Use bitwise AND to get the lower 8 bits only
        hashBytes.push(charCode & 0xFF);
      }
      // Convert to hex string
      const hash = hashBytes.map(b => b.toString(16).padStart(2, '0')).join('');
      pos += 20;

      // Determine type from mode
      let type: string;
      if (mode === '40000' || mode === '040000' || mode === '0000') {
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
export function formatCommitContent(content: string, parsedCommit?: ParsedCommitObject): string {
  let html = '<div>';

  // If we have pre-parsed content from the server, use it
  if (parsedCommit) {
    // Explicitly add header entries
    html += `<div><strong>tree:</strong> <span class="tree"><a href="#" class="hash-link" data-hash="${parsedCommit.tree}">${parsedCommit.tree}</a></span></div>`;

    if (Array.isArray(parsedCommit.parent)) {
      parsedCommit.parent.forEach(parentHash => {
        html += `<div><strong>parent:</strong> <span class="commit"><a href="#" class="hash-link" data-hash="${parentHash}">${parentHash}</a></span></div>`;
      });
    } else {
       html += `<div><strong>parent:</strong> <span class="commit"><a href="#" class="hash-link" data-hash="${parsedCommit.parent}">${parsedCommit.parent}</a></span></div>`;
    }

    html += `<div><strong>author:</strong> ${parsedCommit.author}</div>`;
    html += `<div><strong>committer:</strong> ${parsedCommit.committer}</div>`;

    html += '<hr>';

    // Add commit message
    if (parsedCommit.message) {
      html += `<div><strong>Message:</strong><br>${parsedCommit.message.replace(/\n/g, '<br>')}</div>`;
    }

  } else {
    // Fallback to the original parser if no pre-parsed content
    const parsed = parseCommitObject(content);

    // Explicitly add header entries
    html += `<div><strong>tree:</strong> <span class="tree"><a href="#" class="hash-link" data-hash="${parsed.tree}">${parsed.tree}</a></span></div>`;

    if (Array.isArray(parsed.parent)) {
      parsed.parent.forEach(parentHash => {
        html += `<div><strong>parent:</strong> <span class="commit"><a href="#" class="hash-link" data-hash="${parentHash}">${parentHash}</a></span></div>`;
      });
    } else {
       html += `<div><strong>parent:</strong> <span class="commit"><a href="#" class="hash-link" data-hash="${parsed.parent}">${parsed.parent}</a></span></div>`;
    }

    html += `<div><strong>author:</strong> ${parsed.author}</div>`;
    html += `<div><strong>committer:</strong> ${parsed.committer}</div>`;

    html += '<hr>';

    // Add commit message
    if (parsed.message) {
      html += `<div><strong>Message:</strong><br>${parsed.message.replace(/\n/g, '<br>')}</div>`;
    }
  }

  html += '</div>';
  return html;
}

// Helper function to extract timestamp from Git author string
export function extractDateFromAuthor(authorString: string): number {
  // Format: "Author Name <email@example.com> 1234567890 +0000"
  const matches = authorString.match(/ (\d+) [+-]\d{4}$/);
  if (matches && matches[1]) {
    return parseInt(matches[1], 10);
  }
  return 0;
}
