import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { CorporateFinanceState, ErrorRecord } from "../types.js";
import { FinanceAnalysisConfig } from "../types.js";
import { extractMarkdownTables } from "../utils/table-parser.js";
import { log, debug, warn, logLLMResponse } from "../utils/logger.js";
import { getDecisionTypeConfig } from "../decision-config.js";
import { createLLM } from "../llm.js";

/**
 * Decision Node - Synthesizes analysis into recommendation.
 * Dynamically adapts decision format based on decision_type.
 */
export function createDecisionNode(config: FinanceAnalysisConfig) {
  const llm = createLLM(config, 0.2);
  
  return async (state: CorporateFinanceState): Promise<Partial<CorporateFinanceState>> => {
    log("Decision Node: Synthesizing recommendation...");
    
    const errors: ErrorRecord[] = [];
    const dtConfig = getDecisionTypeConfig(state.decisionType);
    const optionsJson = JSON.stringify(state.options ?? { type: "binary", choices: ["yes", "no"] });
    const isMulti = state.options?.type === "multi";
    const choiceNames = state.options?.choices ?? ["yes", "no"];

    const systemMessage = new SystemMessage(`You are a decision analyst synthesizing multi-agent financial analysis into a clear management recommendation.

DECISION CONTEXT:
- Decision type: ${state.decisionType}
- Options: ${optionsJson}

IF options.type is 'binary':

  SCENARIO DECISION TABLE (3 rows — one per scenario):
  | Scenario | Key Metrics Summary | Threshold Met? | Risk-Adjusted Outcome | Weight |
  Rows: Downside | Base | Upside
  Threshold Met column MUST show:
    '[MetricName]: [actual] / [threshold] ([%]) → Yes/No/Partial'
    Example: 'NPV: $2.34M / >$0 (positive) → Yes'
    Never just 'Yes' or 'No' without numbers.

  RECOMMENDATION TABLE (exactly 1 row):
  | Decision | Primary Justification | Required Conditions | Deal-Breakers | Monitoring Metrics |
  Decision column must say explicitly:
    'YES — proceed with [action]'
    OR
    'NO — do not proceed'
  Never recommend Upside if Base meets all thresholds.
  If Base meets all thresholds: recommend Base, decision = YES.
  If Base fails one or more thresholds: decision = NO.
  Justification must cite specific metric values vs thresholds.

IF options.type is 'multi':

  SCENARIO DECISION TABLE:
  One row per choice per scenario.
  Use actual choice names as labels, not "Option A"/"Option B".
  | Choice | Scenario | Key Metrics Summary | Threshold Met? | Risk-Adjusted Outcome | Weight |

  RECOMMENDATION TABLE (exactly 1 row):
  | Recommended Choice | Primary Justification | Required Conditions | Deal-Breakers | Monitoring Metrics |
  Recommended Choice must name the specific choice
  (e.g. 'Acquire TaskPilot' not 'Option A').
  Justification must compare both choices with actual numbers.
  Example: '[Choice 1] achieves [metric] vs [Choice 2] achieves [metric]'

UNIVERSAL RULES:
- Recommendation table must have EXACTLY 1 row always
- Never use "Option A" or "Option B" in any cell
- Output ONLY the two tables, no narrative, no code blocks`);

    const userMessage = new HumanMessage(`Strategic Objective: ${state.strategicObjective}
Decision Type: ${state.decisionType}
Options: ${optionsJson}

Scenario Metrics:
${state.metricComparisonTable}

Sensitivity Results:
${state.sensitivityTables.map((table, idx) => `Sensitivity Table ${idx + 1}:\n${table}`).join("\n\n")}

Decision Fragility:
${state.decisionFragilityTable}

Locked Assumptions:
${state.finalAssumptionScenarioTable}

Produce the Scenario Decision Table and Recommendation Table.
Use actual choice names from options.choices as labels.
Never use Option A or Option B.`);

    let retryCount = 0;
    let scenarioDecisionTable = "";
    let recommendationTable = "";
    
    while (retryCount <= config.maxRetries) {
      try {
        const response = await llm.invoke([systemMessage, userMessage]);
        const responseText = response.content as string;
        
        await logLLMResponse("decision", responseText, retryCount + 1);
        debug(`Decision Node: LLM response length: ${responseText.length} characters`);
        
        const tables = extractMarkdownTables(responseText);
        debug(`Decision Node: Extracted ${tables.length} tables from response`);
        
        // Find scenario decision table
        const scenarioTable = tables.find(t =>
          (t.headers.some(h => h.toLowerCase().includes("scenario")) || 
           t.headers.some(h => h.toLowerCase().includes("alternative"))) &&
          t.headers.some(h => h.toLowerCase().includes("threshold") || h.toLowerCase().includes("recommendation"))
        );
        
        if (scenarioTable) {
          scenarioDecisionTable = `| ${scenarioTable.headers.join(" | ")} |\n|${scenarioTable.headers.map(() => "---").join("|")}|\n${scenarioTable.rows.map(r => `| ${r.join(" | ")} |`).join("\n")}`;
        }
        
        // Find recommendation table
        let recommendationTableMatch = isMulti 
          ? tables.find(t => t.headers.some(h => h.toLowerCase().includes("alternative")))
          : null;
        
        if (!recommendationTableMatch) {
          recommendationTableMatch = tables.find(t =>
            t.headers.some(h => h.toLowerCase().includes("recommended") || 
                              (h.toLowerCase().includes("recommendation") && !h.toLowerCase().includes("weight")))
          );
        }
        // Binary fallback: look for table with "Decision" + "Justification"/"Conditions" headers
        if (!recommendationTableMatch) {
          recommendationTableMatch = tables.find(t =>
            t.headers.some(h => h.toLowerCase().includes("decision")) &&
            t.headers.some(h => h.toLowerCase().includes("justification") || h.toLowerCase().includes("conditions"))
          );
        }
        
        if (recommendationTableMatch) {
          const hasRequiredCols = recommendationTableMatch.headers.some(h => 
            h.toLowerCase().includes("justification") || h.toLowerCase().includes("conditions")
          );
          
          if (hasRequiredCols && recommendationTableMatch.rows.length === 1) {
            recommendationTable = `| ${recommendationTableMatch.headers.join(" | ")} |\n|${recommendationTableMatch.headers.map(() => "---").join("|")}|\n${recommendationTableMatch.rows.map(r => `| ${r.join(" | ")} |`).join("\n")}`;
          } else if (recommendationTableMatch.rows.length > 1) {
            recommendationTable = `| ${recommendationTableMatch.headers.join(" | ")} |\n|${recommendationTableMatch.headers.map(() => "---").join("|")}|\n| ${recommendationTableMatch.rows[0].join(" | ")} |`;
            if (retryCount < config.maxRetries) {
              throw new Error(`Recommendation table has ${recommendationTableMatch.rows.length} rows. Must have exactly 1.`);
            }
            warn(`Decision Node: Recommendation table had ${recommendationTableMatch.rows.length} rows, using first row only`);
          } else {
            recommendationTable = `| ${recommendationTableMatch.headers.join(" | ")} |\n|${recommendationTableMatch.headers.map(() => "---").join("|")}|\n${recommendationTableMatch.rows.map(r => `| ${r.join(" | ")} |`).join("\n")}`;
          }
        }
        
        if (!scenarioDecisionTable) {
          throw new Error("Scenario decision table not found");
        }
        if (!recommendationTable) {
          throw new Error("Recommendation table not found");
        }
        
        // Validate recommendation
        const recTable = extractMarkdownTables(recommendationTable)[0];
        if (!recTable) {
          throw new Error("Recommendation table could not be parsed");
        }
        
        if (recTable.rows.length !== 1 && retryCount < config.maxRetries) {
          throw new Error(`Recommendation table must have exactly 1 row, found ${recTable.rows.length}.`);
        } else if (recTable.rows.length > 1) {
          recommendationTable = `| ${recTable.headers.join(" | ")} |\n|${recTable.headers.map(() => "---").join("|")}|\n| ${recTable.rows[0].join(" | ")} |`;
        }

        if (isMulti) {
          const recText = recommendationTable.toLowerCase();
          const hasChoiceRef = choiceNames.some(c => recText.includes(c.toLowerCase()));
          if (!hasChoiceRef && retryCount < config.maxRetries) {
            throw new Error(`Recommendation must explicitly name one of the choices: ${choiceNames.join(", ")}`);
          }
        }
        
        log("Decision Node: Successfully generated recommendation");
        break;
        
      } catch (err) {
        retryCount++;
        const errorMessage = err instanceof Error ? err.message : String(err);
        
        if (retryCount > config.maxRetries) {
          errors.push({ nodeId: "decision", errorType: "fatal", message: `Failed to generate recommendation after ${config.maxRetries} retries: ${errorMessage}`, timestamp: new Date().toISOString() });
        } else {
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount - 1)));
        }
      }
    }
    
    return {
      ...state,
      scenarioDecisionTable,
      recommendationTable,
      errors: [...state.errors, ...errors]
    };
  };
}
