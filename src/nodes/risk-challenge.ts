import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { CorporateFinanceState, ErrorRecord, WarningRecord } from "../types.js";
import { FinanceAnalysisConfig } from "../types.js";
import { extractMarkdownTables } from "../utils/table-parser.js";
import { log, warn, debug, logLLMResponse } from "../utils/logger.js";
import { getDecisionTypeConfig } from "../decision-config.js";
import { createLLM } from "../llm.js";

/**
 * Risk Node - Assumption Challenge Phase.
 * Dynamically adapts risk focus based on decision_type.
 */
export function createRiskChallengeNode(config: FinanceAnalysisConfig) {
  const llm = createLLM(config, 0.4);
  
  return async (state: CorporateFinanceState): Promise<Partial<CorporateFinanceState>> => {
    log("Risk Node (Challenge): Analyzing assumption risks...");
    
    const errors: ErrorRecord[] = [];
    const warnings: WarningRecord[] = [];
    const dtConfig = getDecisionTypeConfig(state.decisionType);
    const optionsJson = JSON.stringify(state.options ?? { type: "binary", choices: ["yes", "no"] });
    
    const systemMessage = new SystemMessage(`You are a risk analyst specializing in corporate finance. Your role is to challenge optimistic assumptions and widen downside ranges before they enter the financial model.

DECISION CONTEXT:
- Decision type: ${state.decisionType}
- Options: ${optionsJson}

REQUIRED OUTPUTS — produce exactly these tables:

TABLE 1 — RISK-ADJUSTED ASSUMPTION RANGE TABLE:
If binary: adjust YES case assumptions only. NO case needs no adjustment (it is always status quo).
If multi: produce separate adjusted ranges per choice using actual choice names as labels, not "Option A"/"Option B"
| Variable | Original Range | Risk Factor | Adjusted Range | Rationale |

TABLE 2 — RISK-TO-VARIABLE MAPPING TABLE:
| Risk Category | Affected Variables | Probability | Impact | Mitigation |
Risk categories must be specific to ${state.decisionType}, not generic business risks.

TABLE 3 — STRESS SCENARIO DEFINITION TABLE:
| Scenario Name | Triggering Conditions | Affected Variables | Magnitude | Probability |
Define 2-3 stress scenarios relevant to ${state.decisionType}.

STRICT RULES:
- You MUST make actual adjustments — never copy Strategy's ranges unchanged
- Downside ranges must be meaningfully wider than Strategy proposed
- Output ONLY tables, no narrative, no code blocks
- Use actual choice names as labels, not "Option A"/"Option B"`);

    const userMessage = new HumanMessage(`Business Problem: ${state.businessProblem}
Options: ${optionsJson}
Decision Type: ${state.decisionType}

Draft Assumptions from Strategy:
${state.draftAssumptionTable}

Challenge these assumptions. Widen downside ranges.
Identify risks specific to ${state.decisionType}.
Use choice names from options.choices as labels.`);

    let retryCount = 0;
    let riskAdjustedAssumptionTable = "";
    let riskToVariableMapping = "";
    let stressScenarioDefinitions = "";
    
    while (retryCount <= config.maxRetries) {
      try {
        const response = await llm.invoke([systemMessage, userMessage]);
        const responseText = response.content as string;
        
        await logLLMResponse("risk_challenge", responseText, retryCount + 1);
        debug(`Risk Challenge Node: LLM response length: ${responseText.length} characters`);
        
        const tables = extractMarkdownTables(responseText);
        debug(`Risk Challenge Node: Extracted ${tables.length} tables from response`);
        
        // Find risk-adjusted assumption table(s) — multi decisions produce one per choice
        const isMultiOpt = state.options?.type === "multi";
        const choices = state.options?.choices ?? [];

        let riskAdjustedMatches = tables.filter(t =>
          t.headers.some(h => h.toLowerCase().includes("variable")) &&
          (t.headers.some(h => h.toLowerCase().includes("adjusted range")) ||
           t.headers.some(h => h.toLowerCase().includes("risk factor")) ||
           t.headers.some(h => h.toLowerCase().includes("rationale")))
        );
        if (riskAdjustedMatches.length === 0) {
          riskAdjustedMatches = tables.filter(t =>
            t.headers.some(h => h.toLowerCase().includes("variable")) &&
            !t.headers.some(h => h.toLowerCase().includes("risk category") || h.toLowerCase().includes("scenario name")) &&
            t.headers.length >= 4
          );
        }

        if (riskAdjustedMatches.length > 0) {
          if (riskAdjustedMatches.length > 1 && isMultiOpt) {
            riskAdjustedAssumptionTable = riskAdjustedMatches.map((table, idx) => {
              const label = choices[idx] ?? `Choice ${idx + 1}`;
              return `**${label}**\n\n| ${table.headers.join(" | ")} |\n|${table.headers.map(() => "---").join("|")}|\n${table.rows.map(r => `| ${r.join(" | ")} |`).join("\n")}`;
            }).join("\n\n");
          } else {
            riskAdjustedAssumptionTable = `| ${riskAdjustedMatches[0].headers.join(" | ")} |\n|${riskAdjustedMatches[0].headers.map(() => "---").join("|")}|\n${riskAdjustedMatches[0].rows.map(r => `| ${r.join(" | ")} |`).join("\n")}`;
          }
        }
        
        // Find risk-to-variable mapping table
        let riskMappingMatch = tables.find(t =>
          t.headers.some(h => h.toLowerCase().includes("risk category")) ||
          (t.headers.some(h => h.toLowerCase().includes("risk")) && 
           t.headers.some(h => h.toLowerCase().includes("affected variable")))
        );
        if (!riskMappingMatch) {
          riskMappingMatch = tables.find(t =>
            t.headers.some(h => h.toLowerCase().includes("risk")) &&
            t.headers.some(h => h.toLowerCase().includes("variable"))
          );
        }
        
        if (riskMappingMatch) {
          riskToVariableMapping = `| ${riskMappingMatch.headers.join(" | ")} |\n|${riskMappingMatch.headers.map(() => "---").join("|")}|\n${riskMappingMatch.rows.map(r => `| ${r.join(" | ")} |`).join("\n")}`;
        }
        
        // Find stress scenario table
        let stressScenarioMatch = tables.find(t =>
          t.headers.some(h => h.toLowerCase().includes("scenario name")) ||
          t.headers.some(h => h.toLowerCase().includes("triggering conditions"))
        );
        if (!stressScenarioMatch) {
          stressScenarioMatch = tables.find(t =>
            t.headers.some(h => h.toLowerCase().includes("scenario"))
          );
        }
        
        if (stressScenarioMatch) {
          stressScenarioDefinitions = `| ${stressScenarioMatch.headers.join(" | ")} |\n|${stressScenarioMatch.headers.map(() => "---").join("|")}|\n${stressScenarioMatch.rows.map(r => `| ${r.join(" | ")} |`).join("\n")}`;
        }
        
        // Validate tables
        if (!riskAdjustedAssumptionTable) {
          if (retryCount < config.maxRetries) {
            throw new Error("Risk-adjusted assumption table not found.");
          } else {
            warnings.push({ nodeId: "risk_challenge", message: "Risk-adjusted assumption table not found - proceeding without it", timestamp: new Date().toISOString() });
          }
        }
        if (!riskToVariableMapping) {
          warnings.push({ nodeId: "risk_challenge", message: "Risk-to-variable mapping table not found - proceeding without it", timestamp: new Date().toISOString() });
        }
        if (!stressScenarioDefinitions) {
          warnings.push({ nodeId: "risk_challenge", message: "Stress scenario definitions table not found - proceeding with warning", timestamp: new Date().toISOString() });
        }
        
        log("Risk Node (Challenge): Successfully generated risk-adjusted assumptions");
        break;
        
      } catch (err) {
        retryCount++;
        const errorMessage = err instanceof Error ? err.message : String(err);
        
        if (retryCount > config.maxRetries) {
          errors.push({ nodeId: "risk_challenge", errorType: "validation", message: `Failed after ${config.maxRetries} retries: ${errorMessage}`, timestamp: new Date().toISOString() });
        } else {
          warn(`Risk Node (Challenge): Retry ${retryCount}/${config.maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount - 1)));
        }
      }
    }
    
    return {
      ...state,
      riskAdjustedAssumptionTable,
      riskToVariableMapping,
      stressScenarioDefinitions,
      errors: [...state.errors, ...errors],
      warnings: [...state.warnings, ...warnings]
    };
  };
}
