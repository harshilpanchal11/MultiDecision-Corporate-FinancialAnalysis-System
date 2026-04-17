import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { CorporateFinanceState, ErrorRecord, WarningRecord } from "../types.js";
import { FinanceAnalysisConfig } from "../types.js";
import { extractMarkdownTables } from "../utils/table-parser.js";
import { log, warn, debug, logLLMResponse } from "../utils/logger.js";
import { validateSensitivityVariables } from "../utils/validators.js";
import { getDecisionTypeConfig } from "../decision-config.js";
import { createLLM } from "../llm.js";

/**
 * Risk Node - Stress Testing Phase.
 * Uses decision_type config for sensitivity variable priorities.
 */
export function createRiskStressNode(config: FinanceAnalysisConfig) {
  const llm = createLLM(config, 0.3);
  
  return async (state: CorporateFinanceState): Promise<Partial<CorporateFinanceState>> => {
    log("Risk Node (Stress Testing): Performing sensitivity analysis...");
    
    const errors: ErrorRecord[] = [];
    const warnings: WarningRecord[] = [];
    const dtConfig = getDecisionTypeConfig(state.decisionType);
    const optionsJson = JSON.stringify(state.options ?? { type: "binary", choices: ["yes", "no"] });

    const systemMessage = new SystemMessage(`You are a risk analyst performing stress testing and sensitivity analysis on financial models.

DECISION CONTEXT:
- Decision type: ${state.decisionType}
- Options: ${optionsJson}
- Primary metric for this decision type:
  capital_budgeting → NPV
  acquisition_vs_organic → ARR @ Month 24
  debt_vs_equity → WACC
  market_entry → Break-even Month
  cost_reduction → Payback Period

REQUIRED OUTPUTS:

SENSITIVITY TABLES (6-8 tables, one per variable):
- Identify the 6-8 most impactful variables from the LOCKED ASSUMPTION TABLE provided in state.
  Do NOT use a hardcoded variable list.
  Read what variables actually exist and pick the most impactful.
- For each variable produce one table:
  **Variable Name: [exact name from locked assumption table]**
  | Change (%) | Primary Metric Impact | Secondary Metric Impact | Scenario Viability |
  Test: -30%, -15%, 0%, +15%, +30%
  At 0%: values must match Base scenario from Metric table
  Scenario Viability: Yes / No / Marginal
- Do NOT produce two tables for the same variable
- Use actual calculated values, never placeholders like [impact]
- Use realistic figures with decimals — e.g. $2.34M not $2M,
  17.3% not 15%, 2.3 years not 2 years.

DECISION FRAGILITY TABLE:
| Variable | Break-even Point | Downside Tolerance | Upside Leverage | Sensitivity Rank |
Break-even Point format:
  '[actual value] ([±X%] from base assumption of [base value])'
  Example: '$10.8M (+35% from base of $8.0M)'
  Never write '0% from base' — this is mathematically impossible if any NPV exists.
Minimum 6 variables.

STRICT RULES:
- Output ONLY tables, no narrative, no code blocks
- No placeholder values
- Use actual choice names as labels if multi, not "Option A"/"Option B"`);

    const sensitivityRangesText = Object.entries(config.sensitivityRanges)
      .map(([varName, range]) => `- ${varName}: ${range[0]}% to ${range[1]}%`)
      .join("\n");

    const userMessage = new HumanMessage(`Decision Type: ${state.decisionType}
Options: ${optionsJson}
Sensitivity Ranges:
${sensitivityRangesText || "Default: -30% to +30%"}

Locked Assumptions:
${state.finalAssumptionScenarioTable}

Scenario Metrics:
${state.metricComparisonTable}

Identify the 6-8 most impactful variables from the locked assumption table above. Produce one sensitivity table per variable.
Then produce the Decision Fragility Table.
Use actual choice names as labels, not Option A/B.`);

    let retryCount = 0;
    const sensitivityTables: string[] = [];
    let decisionFragilityTable = "";
    
    while (retryCount <= config.maxRetries) {
      try {
        const response = await llm.invoke([systemMessage, userMessage]);
        const responseText = response.content as string;
        
        await logLLMResponse("risk_stress", responseText, retryCount + 1);
        debug(`Risk Stress Node: LLM response length: ${responseText.length} characters`);
        
        const tables = extractMarkdownTables(responseText);
        debug(`Risk Stress Node: Extracted ${tables.length} tables from response`);
        
        // Extract sensitivity tables
        const sensitivityTableMatches = tables.filter(t =>
          t.headers.some(h => h.toLowerCase().includes("variable change") || h.toLowerCase().includes("change"))
        );
        
        const seenVariables = new Set<string>();

        // Build a unique fingerprint for each table using its first data row
        const tablePosInResponse: number[] = [];
        let searchFrom = 0;
        for (const table of sensitivityTableMatches) {
          const firstDataRow = table.rows[0];
          // Use the first data row to locate this specific table (unique values)
          const fingerprint = firstDataRow
            ? `| ${firstDataRow.join(" | ")} |`
            : `| ${table.headers.join(" | ")} |`;
          const pos = responseText.indexOf(fingerprint, searchFrom);
          tablePosInResponse.push(pos >= 0 ? pos : -1);
          if (pos >= 0) searchFrom = pos + fingerprint.length;
        }

        const extractVarNameBefore = (text: string): string | null => {
          const namePatterns: RegExp[] = [
            /\*\*Variable Name:\s*([^*\n]+)\*\*/g,
            /\*\*([^*\n]{3,})\*\*\s*$/gm,
            /###\s+([^\n]{3,})/g,
            /\n([A-Z][A-Za-z][^\n|*#]{1,60})\s*\n/g,
          ];
          for (const pattern of namePatterns) {
            let lastMatch: RegExpExecArray | null = null;
            let m: RegExpExecArray | null;
            while ((m = pattern.exec(text)) !== null) { lastMatch = m; }
            if (lastMatch && lastMatch[1]) {
              const candidate = lastMatch[1].trim().replace(/[:\-]+$/, "").trim();
              const isGeneric = /^variable\s*\d+$/i.test(candidate);
              const isHeader = /^change|metric|scenario|unit|primary|secondary/i.test(candidate);
              if (candidate.length >= 3 && !isGeneric && !isHeader) return candidate;
            }
          }
          return null;
        };
        
        for (let i = 0; i < sensitivityTableMatches.length; i++) {
          const table = sensitivityTableMatches[i];
          const tableMarkdown = `| ${table.headers.join(" | ")} |\n|${table.headers.map(() => "---").join("|")}|\n${table.rows.map(r => `| ${r.join(" | ")} |`).join("\n")}`;
          
          let varName = `Variable ${i + 1}`;
          const tablePos = tablePosInResponse[i];
          
          if (tablePos > 0) {
            // Look between previous table's position (or start) and this table
            const prevEnd = i > 0 && tablePosInResponse[i - 1] >= 0
              ? tablePosInResponse[i - 1] + 20
              : 0;
            const beforeTable = responseText.substring(Math.max(0, prevEnd), tablePos);
            
            const candidate = extractVarNameBefore(beforeTable);
            if (candidate && !seenVariables.has(candidate)) {
              varName = candidate;
            }
          }
          
          if (varName !== `Variable ${i + 1}`) {
            seenVariables.add(varName);
          }
          
          sensitivityTables.push(`**Variable Name: ${varName}**\n\n${tableMarkdown}`);
        }
        
        // Deduplicate
        const uniqueTables: string[] = [];
        const seenNames = new Set<string>();
        for (const table of sensitivityTables) {
          const match = table.match(/\*\*Variable Name:\s*([^*]+)\*\*/i);
          const vn = match ? match[1].trim() : '';
          if (vn && !seenNames.has(vn)) {
            seenNames.add(vn);
            uniqueTables.push(table);
          } else if (!vn) {
            uniqueTables.push(table);
          }
        }
        sensitivityTables.length = 0;
        sensitivityTables.push(...uniqueTables);
        
        // Find decision fragility table
        const fragilityTable = tables.find(t =>
          t.headers.some(h =>
            h.toLowerCase().includes("fragility") ||
            h.toLowerCase().includes("sensitivity rank") ||
            h.toLowerCase().includes("break-even point")
          )
        );
        if (fragilityTable) {
          decisionFragilityTable = `| ${fragilityTable.headers.join(" | ")} |\n|${fragilityTable.headers.map(() => "---").join("|")}|\n${fragilityTable.rows.map(r => `| ${r.join(" | ")} |`).join("\n")}`;
        }
        
        // Validate sensitivity variables match assumptions
        const varValidation = validateSensitivityVariables(sensitivityTables, state.finalAssumptionScenarioTable);
        if (!varValidation.valid && retryCount < config.maxRetries) {
          throw new Error(`Sensitivity variables don't match assumptions: ${varValidation.errors.join(", ")}`);
        } else if (!varValidation.valid) {
          warnings.push({ nodeId: "risk_stress", message: `Sensitivity variables may not match assumptions: ${varValidation.errors.join(", ")}`, timestamp: new Date().toISOString() });
        }
        
        if (sensitivityTables.length < 4) {
          if (retryCount < config.maxRetries) {
            throw new Error(`Only found ${sensitivityTables.length} sensitivity tables, need at least 6. Generate tables for: ${dtConfig.sensitivityVariablePriorities.slice(0, 6).join(", ")}`);
          } else {
            warnings.push({ nodeId: "risk_stress", message: `Only ${sensitivityTables.length} sensitivity tables generated`, timestamp: new Date().toISOString() });
          }
        }
        
        // Check for placeholders
        const hasPlaceholders = sensitivityTables.some(table => 
          table.includes("[impact]") || table.includes("[value]") || table.includes("[calc]")
        );
        if (hasPlaceholders && retryCount < config.maxRetries) {
          throw new Error("Sensitivity tables contain placeholder values.");
        }
        
        if (!decisionFragilityTable) {
          if (retryCount < config.maxRetries) {
            throw new Error("Decision fragility table not found");
          } else {
            warnings.push({ nodeId: "risk_stress", message: "Decision fragility table not found", timestamp: new Date().toISOString() });
          }
        }
        
        log(`Risk Node (Stress Testing): Generated ${sensitivityTables.length} sensitivity tables`);
        break;
        
      } catch (err) {
        retryCount++;
        const errorMessage = err instanceof Error ? err.message : String(err);
        
        if (retryCount > config.maxRetries) {
          errors.push({ nodeId: "risk_stress", errorType: "validation", message: `Failed after ${config.maxRetries} retries: ${errorMessage}`, timestamp: new Date().toISOString() });
        } else {
          warn(`Risk Node (Stress Testing): Retry ${retryCount}/${config.maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount - 1)));
        }
      }
    }
    
    return {
      ...state,
      sensitivityTables: [...(state.sensitivityTables || []), ...sensitivityTables],
      decisionFragilityTable,
      errors: [...state.errors, ...errors],
      warnings: [...state.warnings, ...warnings]
    };
  };
}
