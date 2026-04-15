/**
 * Parse Markdown table from string
 */
export interface ParsedTable {
  headers: string[];
  rows: string[][];
  raw: string;
}

/**
 * Extract Markdown tables from text - Robust version
 */
export function extractMarkdownTables(text: string): ParsedTable[] {
  const tables: ParsedTable[] = [];
  
  if (!text || text.trim().length === 0) {
    return tables;
  }
  
  // Normalize line endings
  const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  
  // Split text into sections by double newlines to isolate tables
  const sections = normalizedText.split(/\n\s*\n/).filter(s => s.trim().length > 0);
  
  const tableMatches: Array<{header: string, separator: string, data: string, fullMatch: string}> = [];
  
  // Process each section to find tables
  for (const section of sections) {
    // Pattern: header row, separator row, data rows
    const tablePattern = /(\|[^|\n]+(?:\|[^|\n]+)*\|)\s*\n(\|[-\s:|]+\|)\s*\n((?:\|[^|\n]+(?:\|[^|\n]+)*\|\s*\n?)+)/g;
    
    let match;
    while ((match = tablePattern.exec(section)) !== null) {
      tableMatches.push({
        header: match[1],
        separator: match[2],
        data: match[3] || "",
        fullMatch: match[0]
      });
    }
    
    // If no match with separator, try without separator
    if (tableMatches.length === 0 || !section.match(/\|[-\s:|]+\|/)) {
      const noSeparatorPattern = /(\|[^|\n]+(?:\|[^|\n]+)*\|)\s*\n((?:\|[^|\n]+(?:\|[^|\n]+)*\|\s*\n?)+)/g;
      let noSepMatch: RegExpExecArray | null;
      while ((noSepMatch = noSeparatorPattern.exec(section)) !== null) {
        // Skip if this looks like a separator row
        if (noSepMatch && noSepMatch[2].trim().match(/^\|[-\s:|]+\|$/)) continue;
        
        // Check if we already have this table
        if (noSepMatch) {
          const existing = tableMatches.find(t => t.header === noSepMatch![1]);
          if (!existing) {
            tableMatches.push({
              header: noSepMatch[1],
              separator: "",
              data: noSepMatch[2],
              fullMatch: noSepMatch[0]
            });
          }
        }
      }
    }
  }
  
  // Process each table match
  for (const tableMatch of tableMatches) {
    try {
      const headerRow = tableMatch.header.trim();
      const dataRows = tableMatch.data || "";
      
      if (!headerRow) continue;
      
      // Parse headers
      const headerCells = headerRow.split("|")
        .map(h => h.trim())
        .filter(h => h.length > 0);
      
      if (headerCells.length === 0) continue;
      
      const rows: string[][] = [];
      
      // Parse data rows - stop at blank line or next table
      const dataLines = dataRows.split("\n")
        .map(line => line.trim())
        .filter(line => {
          // Must start with | and have content
          if (!line.startsWith("|") || line.length < 3) return false;
          // Skip separator rows
          if (line.match(/^\|[-\s:|]+\|$/)) return false;
          // Stop if we hit what looks like a new table header (blank line followed by |)
          return true;
        });
      
      for (const line of dataLines) {
        const cells = line.split("|")
          .map(c => c.trim())
          .filter((_c, i, arr) => {
            // Filter out empty cells at start/end
            return i > 0 && i < arr.length - 1;
          });
        
        // Accept rows that match header count or are close (within 1)
        if (cells.length === headerCells.length || 
            (cells.length >= headerCells.length - 1 && cells.length <= headerCells.length + 1)) {
          // Pad or trim to match header count
          while (cells.length < headerCells.length) {
            cells.push("");
          }
          if (cells.length > headerCells.length) {
            cells.splice(headerCells.length);
          }
          rows.push(cells);
        }
      }
      
      // Only add table if it has headers and at least one data row
      if (headerCells.length > 0 && rows.length > 0) {
        // Check if we already have this table (avoid duplicates)
        const tableKey = headerCells.join("|");
        const firstRowKey = rows.length > 0 ? rows[0].join("|") : "";
        const isDuplicate = tables.some(t =>
          t.headers.join("|") === tableKey &&
          t.rows.length === rows.length &&
          (t.rows.length === 0 || t.rows[0].join("|") === firstRowKey)
        );
        
        if (!isDuplicate) {
          tables.push({
            headers: headerCells,
            rows,
            raw: tableMatch.fullMatch
          });
        }
      }
    } catch (err) {
      // Skip malformed tables, continue to next match
      continue;
    }
  }
  
  return tables;
}

/**
 * Extract first Markdown table from text
 */
export function extractFirstTable(text: string): ParsedTable | null {
  const tables = extractMarkdownTables(text);
  return tables.length > 0 ? tables[0] : null;
}

/**
 * Extract table by header pattern
 */
export function extractTableByHeader(text: string, headerPattern: string): ParsedTable | null {
  const tables = extractMarkdownTables(text);
  const pattern = new RegExp(headerPattern, "i");
  
  for (const table of tables) {
    const headerText = table.headers.join(" ");
    if (pattern.test(headerText)) {
      return table;
    }
  }
  
  return null;
}

/**
 * Convert parsed table back to Markdown string
 */
export function tableToMarkdown(table: ParsedTable): string {
  const headerRow = `| ${table.headers.join(" | ")} |`;
  const separatorRow = `|${table.headers.map(() => "---").join("|")}|`;
  const dataRows = table.rows.map(row => `| ${row.join(" | ")} |`).join("\n");
  
  return `${headerRow}\n${separatorRow}\n${dataRows}`;
}
