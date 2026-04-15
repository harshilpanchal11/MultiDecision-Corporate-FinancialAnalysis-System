import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { CorporateFinanceState, ErrorRecord } from "../types.js";
import { FinanceAnalysisConfig } from "../types.js";
import { extractMarkdownTables } from "../utils/table-parser.js";
import { log, debug, logLLMResponse, warn } from "../utils/logger.js";
import type { WarningRecord } from "../types.js";
import { validateCashFlowTrends } from "../utils/validators.js";
import { getDecisionTypeConfig } from "../decision-config.js";
import { createLLM } from "../llm.js";

/**
 * Financial Modeling Node - Computes metrics from locked assumptions.
 * Dynamically adapts modeling instructions based on decision_type.
 */
export function createModelingNode(config: FinanceAnalysisConfig) {
  const llm = createLLM(config, 0.1);
  
  return async (state: CorporateFinanceState): Promise<Partial<CorporateFinanceState>> => {
    log("Modeling Node: Computing financial metrics...");
    
    const errors: ErrorRecord[] = [];
    const dtConfig = getDecisionTypeConfig(state.decisionType);
    const optionsJson = JSON.stringify(state.options ?? { type: "binary", choices: ["yes", "no"] });
    const dcMetrics = (state.decisionConfig?.metrics ?? [])
      .map(m => `- ${m.name} (${m.unit}): ${m.description} — Threshold: ${m.threshold}`)
      .join("\n");
    const cashFlowHorizon = state.decisionConfig?.cashFlowHorizon ?? 24;
    const isMulti = state.options?.type === "multi";
    const choiceNames = state.options?.choices ?? ["yes", "no"];

    const systemMessage = new SystemMessage(`You are a financial modeling analyst. Build scenario-based projections from locked assumptions and compute required metrics.

DECISION CONTEXT:
- Decision type: ${state.decisionType}
- Options: ${optionsJson}
- Cash flow horizon: ${cashFlowHorizon} months
- Required metrics:
${dcMetrics}

FINANCIAL CALCULATION CHAIN (enforce this order):
  revenue → costs → FCF → NPV → IRR → Payback
  Every metric must trace back through this chain.
  No metric may be computed in isolation.

OUTPUT STRUCTURE:

IF options.type is 'binary':

  METRIC COMPARISON TABLE (one table):
  | Metric | Unit | NO Case | Downside | Base | Upside |
  NO Case values:
    NPV: $0 (no investment, no new returns)
    IRR: N/A — no investment
    Payback: N/A — no investment
    Revenue metrics: flat at current baseline
    Cost metrics: unchanged from current
  YES case (Downside/Base/Upside): computed from locked assumptions

  CASH FLOW SUMMARY TABLE (one table):
  | Period | NO Case FCF | Downside FCF | Base FCF | Upside FCF | Cumulative Base FCF |
  Periods: Month 0, 6, 12, 18, 24 (extend to ${cashFlowHorizon} if longer)
  Month 0 must show investment cost as negative number
  NO Case: flat FCF at current baseline, no Month 0 outflow

IF options.type is 'multi':

  For EACH choice in options.choices, produce:

  METRIC COMPARISON TABLE — labeled with actual choice name:
  | Metric | Unit | Downside | Base | Upside | Var (Down-Base) | Var (Up-Base) |

  CASH FLOW SUMMARY TABLE — labeled with actual choice name:
  | Period | Downside FCF | Base FCF | Upside FCF | Cumulative Base FCF |
  Periods: Month 0, 6, 12, 18, 24 (extend to ${cashFlowHorizon} if longer)

  CRITICAL: numbers MUST differ meaningfully between choices.
  If two choices have similar economics, their upfront costs,
  revenue trajectories, and risk profiles still differ.
  Never copy one choice's numbers to another.

UNIVERSAL RULES FOR ALL OUTPUT:
- Compute ONLY the metrics in the required metrics list, nothing extra
- Base scenario must meet all thresholds in the required metrics
  If Base does not meet a threshold, adjust the assumption
  driving that metric until it does. Do not change the threshold.
- Cumulative FCF at final period in Cash Flow table MUST equal
  Cumulative FCF in Metric Comparison table for Base scenario.
  Double-check this before producing output.
- ROI must always be expressed as a ratio (e.g. 1.8x), never as $
- Use realistic figures with decimals — e.g. $2.34M not $2M,
  17.3% not 15%, 2.3 years not 2 years.
- Output ONLY tables, no narrative, no code blocks
- Use actual choice names as labels, not "Option A"/"Option B"`);

    const userMessage = new HumanMessage(`Business Problem: ${state.businessProblem}
Strategic Objective: ${state.strategicObjective}
Decision Type: ${state.decisionType}
Options: ${optionsJson}
Cash Flow Horizon: ${cashFlowHorizon} months
Required Metrics with Thresholds:
${dcMetrics}

Locked Assumptions:
${state.finalAssumptionScenarioTable}

Build financial projections following the chain:
revenue → costs → FCF → NPV → IRR → Payback.
Ensure Cumulative FCF matches between Metric table and Cash Flow table.
Use actual choice names as labels, not Option A/B.`);

    let retryCount = 0;
    let metricComparisonTable = "";
    let cashFlowSummaryTable = "";
    const warnings: WarningRecord[] = [];
    
    while (retryCount <= config.maxRetries) {
      try {
        const response = await llm.invoke([systemMessage, userMessage]);
        const responseText = response.content as string;
        
        await logLLMResponse("modeling", responseText, retryCount + 1);
        debug(`Modeling Node: LLM response length: ${responseText.length} characters`);
        
        const tables = extractMarkdownTables(responseText);
        debug(`Modeling Node: Extracted ${tables.length} tables from response`);
        
        // Find metric comparison table(s)
        const metricTables = tables.filter(t =>
          t.headers.some(h => h.toLowerCase().includes("metric")) &&
          t.headers.some(h =>
            h.toLowerCase().includes("downside") ||
            h.toLowerCase().includes("base") ||
            h.toLowerCase().includes("upside") ||
            h.toLowerCase().includes("no case") ||
            h.toLowerCase().includes("scenario") ||
            h.toLowerCase().includes("result") ||
            h.toLowerCase().includes("unit")
          )
        );
        
        if (metricTables.length > 0) {
          if (metricTables.length > 1) {
            metricComparisonTable = metricTables.map((table, idx) => {
              const label = choiceNames[idx] ?? `Choice ${idx + 1}`;
              return `**${label}**\n\n| ${table.headers.join(" | ")} |\n|${table.headers.map(() => "---").join("|")}|\n${table.rows.map(r => `| ${r.join(" | ")} |`).join("\n")}`;
            }).join("\n\n");
          } else {
            metricComparisonTable = `| ${metricTables[0].headers.join(" | ")} |\n|${metricTables[0].headers.map(() => "---").join("|")}|\n${metricTables[0].rows.map(r => `| ${r.join(" | ")} |`).join("\n")}`;
          }
        }
        
        // Find cash flow summary table(s)
        const cashFlowTables = tables.filter(t =>
          t.headers.some(h => h.toLowerCase().includes("cash flow") || h.toLowerCase().includes("period"))
        );
        
        if (cashFlowTables.length > 0) {
          if (cashFlowTables.length > 1) {
            cashFlowSummaryTable = cashFlowTables.map((table, idx) => {
              const label = choiceNames[idx] ?? `Choice ${idx + 1}`;
              return `**${label}**\n\n| ${table.headers.join(" | ")} |\n|${table.headers.map(() => "---").join("|")}|\n${table.rows.map(r => `| ${r.join(" | ")} |`).join("\n")}`;
            }).join("\n\n");
          } else {
            cashFlowSummaryTable = `| ${cashFlowTables[0].headers.join(" | ")} |\n|${cashFlowTables[0].headers.map(() => "---").join("|")}|\n${cashFlowTables[0].rows.map(r => `| ${r.join(" | ")} |`).join("\n")}`;
          }
        }
        
        if (!metricComparisonTable) {
          throw new Error("Metric comparison table not found");
        }
        
        // Check required metrics are present
        const metricNames = state.requiredMetrics.map(m => m.metricName.toLowerCase());
        const tableText = metricComparisonTable.toLowerCase();
        const missingMetrics = metricNames.filter(name => !tableText.includes(name));
        if (missingMetrics.length > 0 && retryCount < config.maxRetries) {
          throw new Error(`Missing required metrics: ${missingMetrics.join(", ")}`);
        }
        
        // Check for placeholder values
        const hasPlaceholders = metricComparisonTable.includes("[value]") || 
                               metricComparisonTable.includes("[calc]") ||
                               metricComparisonTable.includes("[impact]");
        if (hasPlaceholders && retryCount < config.maxRetries) {
          throw new Error("Metric table contains placeholder values. Calculate actual numeric values.");
        }
        
        // Validate ROI format
        const metricTable = extractMarkdownTables(metricComparisonTable)[0];
        if (metricTable) {
          const roiRow = metricTable.rows.find(row => row[0] && row[0].toLowerCase().includes("roi"));
          if (roiRow) {
            const roiUnit = roiRow[1] || "";
            const roiBase = roiRow[3] || "";
            if (roiUnit.toLowerCase().includes("$") && !roiBase.includes("x") && !roiBase.includes("%")) {
              if (retryCount < config.maxRetries) {
                throw new Error(`ROI metric is shown as absolute dollar amount. ROI must be a RATIO (e.g., "2.3x" or "230%").`);
              } else {
                warnings.push({ nodeId: "modeling", message: `ROI shown as dollar amount instead of ratio.`, timestamp: new Date().toISOString() });
              }
            }
          }
        }
        
        if (!cashFlowSummaryTable) {
          throw new Error("Cash flow summary table not found");
        }
        
        const cashFlowHasPlaceholders = cashFlowSummaryTable.includes("[value]");
        if (cashFlowHasPlaceholders && retryCount < config.maxRetries) {
          throw new Error("Cash flow table contains placeholder values.");
        }
        
        // Validate cash flow trends
        const cashFlowValidation = validateCashFlowTrends(cashFlowSummaryTable);
        if (!cashFlowValidation.valid) {
          if (retryCount < config.maxRetries) {
            throw new Error(`Cash flow validation failed: ${cashFlowValidation.errors.join(", ")}`);
          } else {
            cashFlowValidation.errors.forEach(err => {
              warn(`Modeling Node: Cash flow validation warning: ${err}`);
            });
          }
        }
        
        log("Modeling Node: Successfully computed metrics");
        break;
        
      } catch (err) {
        retryCount++;
        const errorMessage = err instanceof Error ? err.message : String(err);
        
        if (retryCount > config.maxRetries) {
          errors.push({ nodeId: "modeling", errorType: "fatal", message: `Failed to compute metrics after ${config.maxRetries} retries: ${errorMessage}`, timestamp: new Date().toISOString() });
        } else {
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount - 1)));
        }
      }
    }
    
    return {
      ...state,
      metricComparisonTable,
      cashFlowSummaryTable,
      errors: [...state.errors, ...errors],
      warnings: [...state.warnings, ...warnings]
    };
  };
}
