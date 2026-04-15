import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { CorporateFinanceState, ErrorRecord, WarningRecord, MetricDefinition } from "../types.js";
import { FinanceAnalysisConfig } from "../types.js";
import { extractMarkdownTables } from "../utils/table-parser.js";
import { validateMarkdownTable, validateAssumptionsForBusinessProblem } from "../utils/validators.js";
import { log, warn, debug, logLLMResponse } from "../utils/logger.js";
import { getDecisionTypeConfig } from "../decision-config.js";
import { createLLM } from "../llm.js";

/**
 * Strategy Node - Identifies value drivers and creates draft assumptions.
 * Dynamically adapts prompts based on decision_type.
 */
export function createStrategyNode(config: FinanceAnalysisConfig) {
  const llm = createLLM(config, 0.3);
  
  return async (state: CorporateFinanceState): Promise<Partial<CorporateFinanceState>> => {
    log("Strategy Node: Analyzing fundamentals...");
    
    const errors: ErrorRecord[] = [];
    const warnings: WarningRecord[] = [];
    const dtConfig = getDecisionTypeConfig(state.decisionType);

    const optionsJson = JSON.stringify(state.options ?? { type: "binary", choices: ["yes", "no"] });
    const dcMetrics = (state.decisionConfig?.metrics ?? [])
      .map(m => `- ${m.name} (${m.unit}): ${m.description} — Threshold: ${m.threshold}`)
      .join("\n");

    const systemMessage = new SystemMessage(`You are a strategic finance consultant specializing in value driver analysis and financial planning.

DECISION CONTEXT:
- Decision type: ${state.decisionType}
- Option structure: ${optionsJson}
  If options.type is 'binary': frame analysis as YES (invest/proceed) vs current baseline (do nothing)
  If options.type is 'multi': frame analysis with one column or section per choice, using the EXACT choice names from options.choices as labels

REQUIRED OUTPUTS — produce exactly these tables:

TABLE 1 — VALUE DRIVER TABLE:
| Value Driver | Economic Impact | Measurability | Priority |
Minimum 5 rows. Drivers must be specific to ${state.decisionType}, not generic.

TABLE 2 — DRAFT ASSUMPTION RANGE TABLE:
If binary: one set of assumptions for the YES case
If multi: separate labeled sections for each choice in options.choices
| Variable | Unit | Downside | Base Case | Upside | Rationale |
Minimum 8 variables. No round numbers.
Use realistic figures with decimals — e.g. $2.34M not $2M, 17.3% not 15%, 2.3 years not 2 years.

REQUIRED METRICS SECTION:
List ONLY the metrics from the provided decisionConfig metrics list.
Do not add or remove any metrics.
Format each as:
- Metric Name: [name from decisionConfig]
  Description: [description from decisionConfig]
  Unit: [unit from decisionConfig]
  Decision Threshold: [threshold from decisionConfig]

STRICT RULES:
- Output ONLY the tables and metrics list, no narrative
- No markdown code blocks
- No "Option A" / "Option B" labels — use actual choice names from options.choices as labels`);

    const userMessage = new HumanMessage(`Business Problem: ${state.businessProblem}
Strategic Objective: ${state.strategicObjective}
Decision Type: ${state.decisionType}
Options: ${optionsJson}
Required Metrics:
${dcMetrics}

Produce the Value Driver Table, Draft Assumption Range Table, and Required Metrics list as specified.
Use choice names from options.choices as labels, not Option A/B.
Minimum 8 assumption variables. No round numbers.`);

    let retryCount = 0;
    let valueDriverTable = "";
    let draftAssumptionTable = "";
    let requiredMetrics: MetricDefinition[] = [];
    
    while (retryCount <= config.maxRetries) {
      try {
        const response = await llm.invoke([systemMessage, userMessage]);
        const responseText = response.content as string;
        
        await logLLMResponse("strategy", responseText, retryCount + 1);
        debug(`Strategy Node: LLM response length: ${responseText.length} characters`);
        debug(`Strategy Node: LLM response preview: ${responseText.substring(0, 500)}...`);
        
        if (responseText.length > 0) {
          console.log(`[DEBUG] Strategy Node: Full LLM response:\n${responseText}\n---END RESPONSE---`);
        }
        
        const tables = extractMarkdownTables(responseText);
        debug(`Strategy Node: Extracted ${tables.length} tables from response`);
        
        if (tables.length === 0) {
          console.log(`[DEBUG] Strategy Node: No tables extracted. Response text:\n${responseText.substring(0, 1000)}`);
        } else {
          tables.forEach((table, idx) => {
            console.log(`[DEBUG] Strategy Node: Table ${idx + 1} headers: ${table.headers.join(", ")}`);
            console.log(`[DEBUG] Strategy Node: Table ${idx + 1} rows: ${table.rows.length}`);
          });
        }
        
        // Find value driver table
        let valueDriverTableMatch = tables.find(t => 
          t.headers.some(h => h.toLowerCase().includes("value driver"))
        );
        if (!valueDriverTableMatch) {
          valueDriverTableMatch = tables.find(t =>
            t.headers.some(h => h.toLowerCase().includes("driver") || h.toLowerCase().includes("economic impact"))
          );
        }
        if (!valueDriverTableMatch && tables.length === 1) {
          valueDriverTableMatch = tables[0];
        }
        
        if (valueDriverTableMatch) {
          valueDriverTable = `| ${valueDriverTableMatch.headers.join(" | ")} |\n|${valueDriverTableMatch.headers.map(() => "---").join("|")}|\n${valueDriverTableMatch.rows.map(r => `| ${r.join(" | ")} |`).join("\n")}`;
          debug(`Strategy Node: Found value driver table with ${valueDriverTableMatch.rows.length} rows`);
        }
        
        // Find draft assumption table(s) — multi decisions produce one per choice
        const isMultiOpt = state.options?.type === "multi";
        const choices = state.options?.choices ?? [];

        let assumptionTableMatches = tables.filter(t =>
          t.headers.some(h => h.toLowerCase().includes("variable")) &&
          !t.headers.some(h => h.toLowerCase().includes("value driver"))
        );
        if (assumptionTableMatches.length === 0) {
          assumptionTableMatches = tables.filter(t =>
            t.headers.some(h =>
              h.toLowerCase().includes("downside") ||
              h.toLowerCase().includes("base case") ||
              h.toLowerCase().includes("upside")
            )
          );
        }
        if (assumptionTableMatches.length === 0 && tables.length >= 2) {
          assumptionTableMatches = [tables[1]];
        }

        if (assumptionTableMatches.length > 0) {
          if (assumptionTableMatches.length > 1 && isMultiOpt) {
            draftAssumptionTable = assumptionTableMatches.map((table, idx) => {
              const label = choices[idx] ?? `Choice ${idx + 1}`;
              return `**${label}**\n\n| ${table.headers.join(" | ")} |\n|${table.headers.map(() => "---").join("|")}|\n${table.rows.map(r => `| ${r.join(" | ")} |`).join("\n")}`;
            }).join("\n\n");
          } else {
            draftAssumptionTable = `| ${assumptionTableMatches[0].headers.join(" | ")} |\n|${assumptionTableMatches[0].headers.map(() => "---").join("|")}|\n${assumptionTableMatches[0].rows.map(r => `| ${r.join(" | ")} |`).join("\n")}`;
          }
          debug(`Strategy Node: Found ${assumptionTableMatches.length} assumption table(s)`);
        }
        
        // Parse required metrics from text
        const metricsMatch = responseText.match(/REQUIRED METRICS[\s\S]*?(?=\n\n|\n##|$)/i);
        if (metricsMatch) {
          const metricsText = metricsMatch[0];
          const metricPattern = /(?:-|\d+\.)\s*(.+?):\s*(.+?)(?:\n|$)/g;
          let match;
          while ((match = metricPattern.exec(metricsText)) !== null && requiredMetrics.length < 8) {
            const name = match[1].trim();
            const rest = match[2].trim();
            const unitMatch = rest.match(/unit[:\s]+([^,]+)/i);
            const thresholdMatch = rest.match(/threshold[:\s]+([^,]+)/i);
            requiredMetrics.push({
              metricName: name,
              description: rest,
              unit: unitMatch ? unitMatch[1].trim() : "N/A",
              decisionThreshold: thresholdMatch ? thresholdMatch[1].trim() : "TBD"
            });
          }
        }
        
        // Validate tables
        const valueDriverValidation = validateMarkdownTable(
          valueDriverTable,
          ["Value Driver", "Economic Impact", "Measurability", "Priority"],
          3
        );
        const assumptionValidation = validateMarkdownTable(
          draftAssumptionTable,
          ["Variable", "Unit"],
          3
        );
        
        if (!valueDriverValidation.valid) {
          throw new Error(`Value Driver Table validation failed: ${valueDriverValidation.errors.join(", ")}`);
        }
        if (!assumptionValidation.valid) {
          throw new Error(`Assumption Table validation failed: ${assumptionValidation.errors.join(", ")}`);
        }
        
        // Validate assumptions address business problem
        const problemValidation = validateAssumptionsForBusinessProblem(
          draftAssumptionTable,
          state.businessProblem
        );
        if (!problemValidation.valid && retryCount < config.maxRetries) {
          throw new Error(`Assumptions don't address business problem: ${problemValidation.errors.join(", ")}`);
        } else if (!problemValidation.valid) {
          warnings.push({
            nodeId: "strategy",
            message: `Assumptions may not fully address business problem: ${problemValidation.errors.join(", ")}`,
            timestamp: new Date().toISOString()
          });
        }
        
        // Fall back to decision-type default metrics if parsing failed
        if (requiredMetrics.length < 4) {
          if (dtConfig.metrics.length >= 4) {
            requiredMetrics = dtConfig.metrics.map(m => ({ ...m }));
            debug(`Strategy Node: Using decision-type default metrics (${requiredMetrics.length})`);
          } else if (config.requiredMetricsList.length >= 4) {
            requiredMetrics = config.requiredMetricsList.map(name => ({
              metricName: name,
              description: `Standard finance metric: ${name}`,
              unit: name.includes("NPV") || name.includes("ROI") ? "$" : name.includes("IRR") ? "%" : "years",
              decisionThreshold: "TBD"
            }));
          } else {
            throw new Error("Could not extract at least 4 required metrics");
          }
        }
        
        log("Strategy Node: Successfully generated value drivers and assumptions");
        break;
        
      } catch (err) {
        retryCount++;
        const errorMessage = err instanceof Error ? err.message : String(err);
        
        if (retryCount > config.maxRetries) {
          errors.push({
            nodeId: "strategy",
            errorType: "fatal",
            message: `Failed after ${config.maxRetries} retries: ${errorMessage}`,
            timestamp: new Date().toISOString()
          });
        } else {
          warn(`Strategy Node: Retry ${retryCount}/${config.maxRetries} - ${errorMessage}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount - 1)));
        }
      }
    }
    
    return {
      ...state,
      valueDriverTable,
      draftAssumptionTable,
      requiredMetrics,
      errors: [...state.errors, ...errors],
      warnings: [...state.warnings, ...warnings]
    };
  };
}
