import dotenv from "dotenv";
import { loadConfig, validateConfig } from "./config.js";
import { buildGraph } from "./graph.js";
import { CorporateFinanceState } from "./types.js";
import { log, error, warn } from "./utils/logger.js";
import { VALID_DECISION_TYPES, getDecisionTypeConfig } from "./decision-config.js";
import type { DecisionType } from "./decision-config.js";

// Load environment variables
dotenv.config();

/**
 * Main execution function
 */
async function main() {
  try {
    // 1. Environment Setup
    log("Initializing Corporate Finance Analysis System...");
    
    if (!process.env.OPENAI_API_KEY) {
      error("FATAL: OPENAI_API_KEY environment variable is required");
      process.exit(1);
    }
    
    const tracingEnabled = process.env.LANGCHAIN_TRACING_V2 === "true";
    if (tracingEnabled && !process.env.LANGCHAIN_API_KEY) {
      warn("LANGCHAIN_TRACING_V2 is enabled but LANGCHAIN_API_KEY is missing. Tracing will be disabled.");
    }
    
    process.env.LANGCHAIN_PROJECT = process.env.LANGCHAIN_PROJECT || "corporate-finance-analysis";
    
    // 2. Configuration Loading
    const config = loadConfig("./config.json");
    validateConfig(config);
    
    // 3. Validate decision_type — MANDATORY CLI argument, no inference, no defaults
    const businessProblem = process.argv[2];
    const strategicObjective = process.argv[3];
    const cliDecisionType = process.argv[4];

    if (!cliDecisionType) {
      error(`FATAL: decision_type is required as the 3rd CLI argument.\n  Usage: node dist/index.js "<business_problem>" "<strategic_objective>" "<decision_type>"\n  Valid decision types: ${VALID_DECISION_TYPES.join(", ")}`);
      process.exit(1);
    }
    if (!VALID_DECISION_TYPES.includes(cliDecisionType as DecisionType)) {
      error(`FATAL: Invalid decision_type: "${cliDecisionType}".\n  Must be one of: ${VALID_DECISION_TYPES.join(", ")}`);
      process.exit(1);
    }
    const decisionType: string = cliDecisionType;

    const dtConfig = getDecisionTypeConfig(decisionType);

    log("Configuration loaded:");
    log(`- Model: ${config.modelId}`);
    log(`- Scenarios: ${config.scenarioCount}`);
    log(`- Decision Type: ${decisionType} (${dtConfig.label})`);
    log(`- Required Metrics: ${config.requiredMetricsList.join(", ")}`);
    log(`- Tracing: ${tracingEnabled ? "Enabled" : "Disabled"}`);
    
    // 4. Graph Construction
    log("Building workflow graph...");
    const graph = buildGraph(config);
    log("Graph compiled successfully");
    
    // 5. Validate required CLI inputs
    if (!businessProblem || businessProblem.trim().length < 10) {
      error("FATAL: business_problem is required as the 1st CLI argument (min 10 characters).\n  Usage: node dist/index.js \"<business_problem>\" \"<strategic_objective>\" \"<decision_type>\"");
      process.exit(1);
    }
    
    if (!strategicObjective || strategicObjective.trim().length === 0) {
      error("FATAL: strategic_objective is required as the 2nd CLI argument.\n  Usage: node dist/index.js \"<business_problem>\" \"<strategic_objective>\" \"<decision_type>\"");
      process.exit(1);
    }
    
    const initialState: Partial<CorporateFinanceState> = {
      businessProblem,
      strategicObjective,
      decisionType,
      extractedFacts: { keyFacts: [], objectives: [], constraints: [], alternatives: [] },
      runMetadata: {
        runId: "",
        timestamp: "",
        modelUsed: config.modelId,
        scenarioCount: config.scenarioCount,
        decisionType,
        startTime: "",
        endTime: ""
      },
      requiredMetrics: [],
      valueDriverTable: "",
      draftAssumptionTable: "",
      riskAdjustedAssumptionTable: "",
      riskToVariableMapping: "",
      stressScenarioDefinitions: "",
      finalAssumptionScenarioTable: "",
      metricComparisonTable: "",
      cashFlowSummaryTable: "",
      sensitivityTables: [],
      decisionFragilityTable: "",
      scenarioDecisionTable: "",
      recommendationTable: "",
      errors: [],
      warnings: []
    };
    
    // 6. Graph Invocation
    log("Starting corporate finance analysis workflow...");
    log(`Business Problem: ${businessProblem}`);
    log(`Strategic Objective: ${strategicObjective}`);
    log(`Decision Type: ${decisionType}`);
    
    const result = await graph.invoke(initialState, {
      tags: [
        "corporate-finance-analysis",
        "multi-agent-workflow",
        config.modelId,
        decisionType
      ],
      metadata: {
        businessProblem: businessProblem.substring(0, 100),
        strategicObjective,
        decisionType,
        scenarioCount: config.scenarioCount,
        requiredMetrics: config.requiredMetricsList,
        startedAt: new Date().toISOString()
      },
      runName: `corporate-finance-${decisionType}-${Date.now()}`
    });
    
    // 6. Result Handling
    if (result.errors.length > 0) {
      error(`\nAnalysis completed with ${result.errors.length} error(s):`);
      result.errors.forEach(err => {
        error(`  [${err.nodeId}] ${err.errorType}: ${err.message}`);
      });
    } else {
      log("✓ Analysis completed successfully");
    }
    
    if (result.warnings.length > 0) {
      warn(`\n${result.warnings.length} warning(s) encountered:`);
      result.warnings.forEach(warnMsg => {
        warn(`  [${warnMsg.nodeId}] ${warnMsg.message}`);
      });
    }
    
    // Show output file location
    const sanitizedProblem = businessProblem
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "_")
      .substring(0, 50);
    
    const timestamp = result.runMetadata.timestamp
      .replace(/[-:]/g, "")
      .replace("T", "_")
      .substring(0, 15);
    
    const filename = config.outputFilenamePattern
      .replace("{businessProblem}", sanitizedProblem)
      .replace("{timestamp}", timestamp);
    
    log(`\nOutput file: ${config.outputDirectory}/${filename}`);
    
    // Log execution summary
    const startTime = new Date(result.runMetadata.startTime);
    const endTime = new Date(result.runMetadata.endTime);
    const duration = ((endTime.getTime() - startTime.getTime()) / 1000).toFixed(2);
    
    log("\nExecution Summary:");
    log(`- Run ID: ${result.runMetadata.runId}`);
    log(`- Duration: ${duration} seconds`);
    log(`- Scenarios Analyzed: ${result.runMetadata.scenarioCount}`);
    log(`- Metrics Calculated: ${result.requiredMetrics.length}`);
    
    // 7. Trace Upload Delay
    if (tracingEnabled) {
      log("Waiting for trace upload to LangSmith...");
      await new Promise(resolve => setTimeout(resolve, 2000));
      log("Trace upload complete. View at: https://smith.langchain.com/");
    }
    
    process.exit(result.errors.some(e => e.errorType === "fatal") ? 1 : 0);
    
  } catch (err) {
    error(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
    if (process.env.NODE_ENV === "development") {
      console.error(err);
    }
    process.exit(1);
  }
}

// Run main function
main();
