import { ParsedTable, extractMarkdownTables } from "./table-parser.js";

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate Markdown table structure
 */
export function validateMarkdownTable(
  tableString: string,
  requiredColumns: string[],
  minRows: number
): ValidationResult {
  const errors: string[] = [];
  
  if (!tableString || tableString.trim().length === 0) {
    return { valid: false, errors: ["Table string is empty"] };
  }
  
  const tables = extractMarkdownTables(tableString);
  
  if (tables.length === 0) {
    return { valid: false, errors: ["No valid Markdown table found"] };
  }
  
  const table = tables[0];
  
  // Check header
  if (table.headers.length === 0) {
    errors.push("Table has no headers");
  }
  
  // Check required columns
  for (const col of requiredColumns) {
    if (!table.headers.some(h => h.toLowerCase().includes(col.toLowerCase()))) {
      errors.push(`Missing required column: ${col}`);
    }
  }
  
  // Check minimum rows
  if (table.rows.length < minRows) {
    errors.push(`Insufficient data rows: expected ${minRows}, got ${table.rows.length}`);
  }
  
  // Check column count consistency
  table.rows.forEach((row, idx) => {
    if (row.length !== table.headers.length) {
      errors.push(`Row ${idx + 1} has ${row.length} columns, expected ${table.headers.length}`);
    }
  });
  
  // Check for empty cells
  table.rows.forEach((row, rowIdx) => {
    row.forEach((cell, colIdx) => {
      if (!cell || cell.trim().length === 0) {
        errors.push(`Empty cell at row ${rowIdx + 1}, column ${colIdx + 1}`);
      }
    });
  });
  
  return { valid: errors.length === 0, errors };
}

/**
 * Validate numeric range (Downside ≤ Base ≤ Upside)
 */
export function validateNumericRange(downside: string, base: string, upside: string): ValidationResult {
  const errors: string[] = [];
  
  const parseNumber = (str: string): number | null => {
    const cleaned = str.replace(/[^0-9.-]/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  };
  
  const down = parseNumber(downside);
  const bas = parseNumber(base);
  const up = parseNumber(upside);
  
  if (down === null || bas === null || up === null) {
    return { valid: false, errors: ["Could not parse numeric values"] };
  }
  
  if (down > bas) {
    errors.push(`Downside value (${down}) is greater than Base value (${bas})`);
  }
  
  if (bas > up) {
    errors.push(`Base value (${bas}) is greater than Upside value (${up})`);
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Check if table contains all required columns
 */
export function hasRequiredColumns(table: ParsedTable, requiredColumns: string[]): boolean {
  const headerLower = table.headers.map(h => h.toLowerCase());
  
  for (const col of requiredColumns) {
    if (!headerLower.some(h => h.includes(col.toLowerCase()))) {
      return false;
    }
  }
  
  return true;
}

/**
 * Validate that assumptions address the business problem
 */
export function validateAssumptionsForBusinessProblem(
  assumptionTable: string,
  businessProblem: string
): ValidationResult {
  const errors: string[] = [];
  const tables = extractMarkdownTables(assumptionTable);
  
  if (tables.length === 0) {
    return { valid: false, errors: ["No assumption table found"] };
  }
  
  const table = tables[0];
  const variables = table.rows.map(row => row[0]?.toLowerCase() || "");
  const problemLower = businessProblem.toLowerCase();
  
  // Check for acquisition-related variables if problem mentions acquisition
  if (problemLower.includes("acquire") || problemLower.includes("acquisition")) {
    const hasAcquisitionVars = variables.some(v => 
      v.includes("acquisition") || v.includes("purchase price") || 
      v.includes("integration") || v.includes("synergy")
    );
    if (!hasAcquisitionVars) {
      errors.push("Business problem mentions acquisition but assumptions lack acquisition-specific variables (e.g., acquisition price, integration costs)");
    }
  }
  
  // Check for revenue/growth variables
  if (problemLower.includes("arr") || problemLower.includes("revenue") || problemLower.includes("growth")) {
    const hasRevenueVars = variables.some(v => 
      v.includes("arr") || v.includes("revenue") || v.includes("growth")
    );
    if (!hasRevenueVars) {
      errors.push("Business problem mentions ARR/revenue/growth but assumptions lack revenue variables");
    }
  }
  
  // Check minimum variable count
  if (variables.length < 5) {
    errors.push(`Too few variables (${variables.length}). Need at least 5 for meaningful analysis.`);
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Validate that sensitivity variables exist in assumptions
 */
export function validateSensitivityVariables(
  sensitivityTables: string[],
  assumptionTable: string
): ValidationResult {
  const errors: string[] = [];
  
  const assumptionTables = extractMarkdownTables(assumptionTable);
  if (assumptionTables.length === 0) {
    return { valid: false, errors: ["No assumption table found"] };
  }
  
  const assumptionVars = assumptionTables.flatMap(t =>
    t.rows.map(row => row[0]?.toLowerCase().trim() || "")
  ).filter(v => v.length > 0);
  
  for (const sensTable of sensitivityTables) {
    const varNameMatch = sensTable.match(/\*\*Variable Name:\s*([^*]+)\*\*/i) ||
                         sensTable.match(/Variable Name:\s*([^\n]+)/i) ||
                         sensTable.match(/###\s*([^\n]+)/);
    
    if (varNameMatch) {
      const rawName = varNameMatch[1].trim();
      if (/^(variable|sensitivity variable)\s*\d+$/i.test(rawName)) {
        errors.push(`Sensitivity variable "${rawName}" not found in assumptions table`);
        continue;
      }
      const varName = rawName.toLowerCase();
      const varWords = varName.replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2);
      const matches = assumptionVars.some(av => {
        if (av.includes(varName) || varName.includes(av)) return true;
        if (av.replace(/\s+/g, "").includes(varName.replace(/\s+/g, ""))) return true;
        const avWords = av.replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2);
        const shared = varWords.filter(w => avWords.includes(w));
        return shared.length >= Math.min(2, varWords.length) && shared.length > 0;
      });
      
      if (!matches) {
        errors.push(`Sensitivity variable "${rawName}" not found in assumptions table`);
      }
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Validate cash flow trends (should start negative, trend positive)
 */
export function validateCashFlowTrends(cashFlowTable: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const tables = extractMarkdownTables(cashFlowTable);
  if (tables.length === 0) {
    return { valid: false, errors: ["No cash flow table found"] };
  }
  
  for (const table of tables) {
    // Find cash flow columns (look for "Cash Flow" in headers)
    const cashFlowColIndices: number[] = [];
    table.headers.forEach((header, idx) => {
      if (header.toLowerCase().includes("cash flow") && 
          !header.toLowerCase().includes("cumulative")) {
        cashFlowColIndices.push(idx);
      }
    });
    
    if (cashFlowColIndices.length === 0) {
      continue; // Skip if no cash flow columns found
    }
    
    // Check first period (Month 0 or Period 0)
    const firstRow = table.rows[0];
    if (firstRow) {
      for (const colIdx of cashFlowColIndices) {
        const firstValue = firstRow[colIdx] || "";
        const numValue = parseFloat(firstValue.replace(/[^0-9.-]/g, ""));
        
        // Month 0 should typically be negative (investment)
        if (!isNaN(numValue) && numValue > 0) {
          warnings.push(`Month 0 cash flow is positive (${numValue}). Typically should be negative for investment phase.`);
        }
      }
    }
    
    // Check last period (Month 24 or final period)
    const lastRow = table.rows[table.rows.length - 1];
    if (lastRow) {
      for (const colIdx of cashFlowColIndices) {
        const lastValue = lastRow[colIdx] || "";
        const numValue = parseFloat(lastValue.replace(/[^0-9.-]/g, ""));
        
        // Month 24 should be positive or near-zero (per strategic objective)
        if (!isNaN(numValue) && numValue < -1000) {
          errors.push(`Month 24 cash flow is still very negative (${numValue}). Should trend toward positive per strategic objective.`);
        }
      }
    }
    
    // Check cumulative FCF column
    const cumulativeColIdx = table.headers.findIndex(h => 
      h.toLowerCase().includes("cumulative") && 
      (h.toLowerCase().includes("fcf") || h.toLowerCase().includes("npv"))
    );
    
    if (cumulativeColIdx >= 0) {
      const cumulativeValues = table.rows.map(row => {
        const val = row[cumulativeColIdx] || "";
        return parseFloat(val.replace(/[^0-9.-]/g, ""));
      }).filter(v => !isNaN(v));
      
      if (cumulativeValues.length > 1) {
        const firstCumulative = cumulativeValues[0];
        const lastCumulative = cumulativeValues[cumulativeValues.length - 1];
        
        // Cumulative should improve (less negative or more positive)
        if (!isNaN(firstCumulative) && !isNaN(lastCumulative)) {
          if (lastCumulative < firstCumulative - 1000) {
            errors.push(`Cumulative FCF worsens from ${firstCumulative} to ${lastCumulative}. Should improve over time.`);
          }
          
          // Check if trending positive by Month 24
          if (lastCumulative < -10000) {
            warnings.push(`Cumulative FCF at Month 24 is ${lastCumulative}. Strategic objective requires trending positive.`);
          }
        }
      }
    }
  }
  
  return { valid: errors.length === 0, errors: [...errors, ...warnings] };
}
