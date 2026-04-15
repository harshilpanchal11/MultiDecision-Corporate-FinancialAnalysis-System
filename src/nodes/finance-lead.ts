import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { CorporateFinanceState, ErrorRecord } from "../types.js";
import { FinanceAnalysisConfig } from "../types.js";
import { extractMarkdownTables } from "../utils/table-parser.js";
import { validateMarkdownTable } from "../utils/validators.js";
import { log, debug, logLLMResponse } from "../utils/logger.js";
import { getDecisionTypeConfig } from "../decision-config.js";
import { createLLM } from "../llm.js";

/**
 * Finance Lead Node - Locks final assumption set.
 * Adapts context based on decision_type.
 */
export function createFinanceLeadNode(config: FinanceAnalysisConfig) {
  const llm = createLLM(config, 0.2);
  
  return async (state: CorporateFinanceState): Promise<Partial<CorporateFinanceState>> => {
    log("Finance Lead Node: Locking final assumptions...");
    
    const errors: ErrorRecord[] = [];
    const dtConfig = getDecisionTypeConfig(state.decisionType);
    const optionsJson = JSON.stringify(state.options ?? { type: "binary", choices: ["yes", "no"] });
    const dcMetrics = (state.decisionConfig?.metrics ?? [])
      .map(m => `- ${m.name} (${m.unit}): ${m.description} — Threshold: ${m.threshold}`)
      .join("\n");

    const systemMessage = new SystemMessage(`You are the Finance Lead responsible for locking the final assumption set for financial modeling.

DECISION CONTEXT:
- Decision type: ${state.decisionType}
- Options: ${optionsJson}

REQUIRED OUTPUT — produce exactly one table:

FINAL ASSUMPTION AND SCENARIO TABLE:
If binary: columns are Variable | Unit | NO Case | Downside | Base | Upside | Locked By | Notes
  NO Case column values: revenue flat, costs unchanged, no investment
If multi: produce one table per choice using actual choice names as headers, not "Option A"/"Option B"
| Variable | Unit | Downside | Base | Upside | Locked By | Conflict Notes |

LOCKED BY column values:
  'Strategy' — if using Strategy's original range
  'Risk Team' — if using Risk's adjusted range
  'Finance Lead' — if using a compromise value

CONFLICT NOTES column:
  For every variable where Strategy and Risk differ: explain which was chosen and why in one sentence.
  If no conflict: write 'Aligned'

STRICT RULES:
- Every assumption must map to at least one metric from the required metrics list
- Scenarios must be internally consistent (do not mix best-case revenue with worst-case costs)
- Output ONLY the table, no narrative, no code blocks
- Use actual choice names as labels, not "Option A"/"Option B"`);

    const userMessage = new HumanMessage(`Business Problem: ${state.businessProblem}
Decision Type: ${state.decisionType}
Options: ${optionsJson}
Required Metrics:
${dcMetrics}

Strategy Team Assumptions:
${state.draftAssumptionTable}

Risk Team Challenged Assumptions:
${state.riskAdjustedAssumptionTable}

Lock the final assumptions. Resolve all conflicts.
Use choice names from options.choices as labels, not Option A/B.`);

    let retryCount = 0;
    let finalAssumptionScenarioTable = "";
    
    while (retryCount <= config.maxRetries) {
      try {
        const response = await llm.invoke([systemMessage, userMessage]);
        const responseText = response.content as string;
        
        await logLLMResponse("finance_lead", responseText, retryCount + 1);
        debug(`Finance Lead Node: LLM response length: ${responseText.length} characters`);
        
        const tables = extractMarkdownTables(responseText);
        debug(`Finance Lead Node: Extracted ${tables.length} tables from response`);

        const isMultiOpt = state.options?.type === "multi";
        const choices = state.options?.choices ?? [];

        let assumptionTables = tables.filter(t =>
          t.headers.some(h => h.toLowerCase().includes("variable")) &&
          t.headers.some(h =>
            h.toLowerCase().includes("unit") ||
            h.toLowerCase().includes("downside") ||
            h.toLowerCase().includes("base") ||
            h.toLowerCase().includes("locked") ||
            h.toLowerCase().includes("scenario")
          )
        );
        if (assumptionTables.length === 0 && tables.length > 0) {
          assumptionTables = [tables[0]];
        }

        const finalTable = assumptionTables[0] ?? null;

        if (finalTable) {
          if (assumptionTables.length > 1 && isMultiOpt) {
            finalAssumptionScenarioTable = assumptionTables.map((table, idx) => {
              const label = choices[idx] ?? `Choice ${idx + 1}`;
              return `**${label}**\n\n| ${table.headers.join(" | ")} |\n|${table.headers.map(() => "---").join("|")}|\n${table.rows.map(r => `| ${r.join(" | ")} |`).join("\n")}`;
            }).join("\n\n");
          } else {
            finalAssumptionScenarioTable = `| ${finalTable.headers.join(" | ")} |\n|${finalTable.headers.map(() => "---").join("|")}|\n${finalTable.rows.map(r => `| ${r.join(" | ")} |`).join("\n")}`;
          }
        }

        const validation = validateMarkdownTable(
          finalAssumptionScenarioTable,
          ["Variable", "Unit"],
          3
        );

        if (!validation.valid) {
          throw new Error(`Table validation failed: ${validation.errors.join(", ")}`);
        }

        if (finalTable && finalTable.rows.length < 3) {
          throw new Error("Final assumption table must have at least 3 variables");
        }
        
        log("Finance Lead Node: Successfully locked final assumptions");
        break;
        
      } catch (err) {
        retryCount++;
        const errorMessage = err instanceof Error ? err.message : String(err);
        
        if (retryCount > config.maxRetries) {
          errors.push({ nodeId: "finance_lead", errorType: "fatal", message: `Failed to lock assumptions after ${config.maxRetries} retries: ${errorMessage}`, timestamp: new Date().toISOString() });
        } else {
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount - 1)));
        }
      }
    }
    
    return {
      ...state,
      finalAssumptionScenarioTable,
      errors: [...state.errors, ...errors]
    };
  };
}
