import { v4 as uuidv4 } from "uuid";
import { CorporateFinanceState, ErrorRecord, ExtractedFacts, DecisionOptions, DecisionConfig } from "../types.js";
import { FinanceAnalysisConfig } from "../types.js";
import { log, warn } from "../utils/logger.js";
import { getDecisionTypeConfig, VALID_DECISION_TYPES, DECISION_CONFIGS } from "../decision-config.js";
import { createLLM } from "../llm.js";

/**
 * Extract key facts, objectives, constraints, and alternatives from the business problem.
 * This is a lightweight parsing step — no LLM call — that structures the input for downstream nodes.
 */
function extractFacts(businessProblem: string, strategicObjective: string, decisionType: string): ExtractedFacts {
  const dtConfig = getDecisionTypeConfig(decisionType);
  const facts: ExtractedFacts = { keyFacts: [], objectives: [], constraints: [], alternatives: [] };

  const sentences = businessProblem
    .replace(/\n/g, " ")
    .split(/[.;]/)
    .map(s => s.trim())
    .filter(s => s.length > 5);

  for (const s of sentences) {
    const lower = s.toLowerCase();
    if (lower.includes("must") || lower.includes("need") || lower.includes("constraint") || lower.includes("limit")) {
      facts.constraints.push(s);
    } else if (lower.includes("goal") || lower.includes("objective") || lower.includes("target") || lower.includes("reach")) {
      facts.objectives.push(s);
    } else {
      facts.keyFacts.push(s);
    }
  }

  // Parse objectives from strategicObjective
  const objParts = strategicObjective.split(/,|and/).map(s => s.trim()).filter(s => s.length > 3);
  facts.objectives.push(...objParts);

  if (dtConfig.hasAlternatives && dtConfig.alternativeLabels) {
    facts.alternatives.push(dtConfig.alternativeLabels.a, dtConfig.alternativeLabels.b);
  }

  return facts;
}

/**
 * Start Node - Validates input, resolves decision_type, extracts facts, initializes state
 */
export function createStartNode(config: FinanceAnalysisConfig) {
  return async (state: CorporateFinanceState): Promise<Partial<CorporateFinanceState>> => {
    log("Starting workflow initialization...");
    
    const errors: ErrorRecord[] = [];
    
    // Validate business problem
    if (!state.businessProblem || state.businessProblem.trim().length < 10) {
      errors.push({
        nodeId: "start",
        errorType: "fatal",
        message: "Business problem must be at least 10 characters long",
        timestamp: new Date().toISOString()
      });
    }
    
    // Validate strategic objective
    if (!state.strategicObjective || state.strategicObjective.trim().length === 0) {
      errors.push({
        nodeId: "start",
        errorType: "fatal",
        message: "Strategic objective is required",
        timestamp: new Date().toISOString()
      });
    }

    // Strict validation — decision_type must already be set by CLI; no inference, no defaults
    const decisionType = state.decisionType;
    if (!decisionType || !VALID_DECISION_TYPES.includes(decisionType as any)) {
      errors.push({
        nodeId: "start",
        errorType: "fatal",
        message: `Invalid or missing decision_type: "${decisionType || ""}". Must be one of: ${VALID_DECISION_TYPES.join(", ")}`,
        timestamp: new Date().toISOString()
      });
      return { ...state, errors: [...(state.errors || []), ...errors], warnings: state.warnings || [] };
    }

    const dtConfig = getDecisionTypeConfig(decisionType);
    log(`Decision Type resolved: ${decisionType} (${dtConfig.label})`);

    // Fact extraction step
    const extractedFacts = extractFacts(state.businessProblem, state.strategicObjective, decisionType);
    log(`Extracted ${extractedFacts.keyFacts.length} key facts, ${extractedFacts.objectives.length} objectives, ${extractedFacts.constraints.length} constraints`);
    
    // Generate run metadata
    const runId = uuidv4();
    const timestamp = new Date().toISOString();
    
    const runMetadata = {
      runId,
      timestamp,
      modelUsed: config.modelId,
      scenarioCount: config.scenarioCount,
      decisionType,
      startTime: timestamp,
      endTime: ""
    };
    
    // OPERATION A — Load decisionConfig into state
    const loadedDecisionConfig: DecisionConfig | null = DECISION_CONFIGS[decisionType] ?? null;
    if (!loadedDecisionConfig) {
      errors.push({
        nodeId: "start",
        errorType: "fatal",
        message: `Unknown decision_type: ${decisionType}. Valid types: capital_budgeting, acquisition_vs_organic, debt_vs_equity, market_entry, cost_reduction`,
        timestamp: new Date().toISOString()
      });
      return { ...state, errors: [...(state.errors || []), ...errors], warnings: state.warnings || [] };
    }
    log(`Loaded decisionConfig for ${decisionType}: ${loadedDecisionConfig.metrics.length} metrics, horizon=${loadedDecisionConfig.cashFlowHorizon}, type=${loadedDecisionConfig.optionType}`);

    // OPERATION B — Set options into state
    let options: DecisionOptions;

    if (decisionType === "capital_budgeting" || decisionType === "market_entry" || decisionType === "cost_reduction") {
      options = { type: "binary", choices: ["yes", "no"] };
      log(`Options set (binary): ${JSON.stringify(options.choices)}`);
    } else {
      // acquisition_vs_organic or debt_vs_equity — extract alternatives via LLM
      try {
        const llm = createLLM(config, 0.1);
        const response = await llm.invoke([
          { role: "system", content: "You are a precise text extraction assistant. Return JSON only. No explanation. No markdown." },
          { role: "user", content: `Extract the two strategic alternatives being compared in this business problem. Return this exact format: { "choices": ["first alternative", "second alternative"] }\nBusiness problem: ${state.businessProblem}` },
        ]);
        const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
        const parsed = JSON.parse(text.replace(/```json?\s*/gi, "").replace(/```/g, "").trim());
        if (Array.isArray(parsed.choices) && parsed.choices.length >= 2 && typeof parsed.choices[0] === "string" && typeof parsed.choices[1] === "string") {
          options = { type: "multi", choices: [parsed.choices[0], parsed.choices[1]] };
          log(`Options extracted (multi): ${JSON.stringify(options.choices)}`);
        } else {
          throw new Error("choices array missing or invalid");
        }
      } catch (e) {
        options = { type: "multi", choices: ["option_1", "option_2"] };
        warn(`Option extraction failed — using fallback labels. Error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Initialize all state fields
    return {
      ...state,
      decisionType,
      extractedFacts,
      runMetadata,
      options,
      decisionConfig: loadedDecisionConfig,
      requiredMetrics: state.requiredMetrics || [],
      valueDriverTable: state.valueDriverTable || "",
      draftAssumptionTable: state.draftAssumptionTable || "",
      riskAdjustedAssumptionTable: state.riskAdjustedAssumptionTable || "",
      riskToVariableMapping: state.riskToVariableMapping || "",
      stressScenarioDefinitions: state.stressScenarioDefinitions || "",
      finalAssumptionScenarioTable: state.finalAssumptionScenarioTable || "",
      metricComparisonTable: state.metricComparisonTable || "",
      cashFlowSummaryTable: state.cashFlowSummaryTable || "",
      sensitivityTables: state.sensitivityTables || [],
      decisionFragilityTable: state.decisionFragilityTable || "",
      scenarioDecisionTable: state.scenarioDecisionTable || "",
      recommendationTable: state.recommendationTable || "",
      errors: [...(state.errors || []), ...errors],
      warnings: state.warnings || []
    };
  };
}
