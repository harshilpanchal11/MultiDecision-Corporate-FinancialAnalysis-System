import { Annotation } from "@langchain/langgraph";

// Metric Definition Interface
export interface MetricDefinition {
  metricName: string;
  description: string;
  unit: string;
  decisionThreshold: string;
}

// Error Record Interface
export interface ErrorRecord {
  nodeId: string;
  errorType: "fatal" | "validation" | "business_logic";
  message: string;
  timestamp: string;
  context?: unknown;
}

// Warning Record Interface
export interface WarningRecord {
  nodeId: string;
  message: string;
  timestamp: string;
}

// Extracted facts from business problem (fact extraction step)
export interface ExtractedFacts {
  keyFacts: string[];
  objectives: string[];
  constraints: string[];
  alternatives: string[];
}

// Options for binary (go/no-go) or multi-alternative decisions
export interface DecisionOptions {
  type: "binary" | "multi";
  choices: string[];
}

// Per-decision-type metric + horizon config loaded at start
export interface DecisionConfig {
  metrics: {
    name: string;
    unit: string;
    threshold: string;
    description: string;
  }[];
  optionType: "binary" | "multi";
  cashFlowHorizon: number;
}

// Run Metadata Interface
export interface RunMetadata {
  runId: string;
  timestamp: string;
  modelUsed: string;
  scenarioCount: number;
  decisionType: string;
  startTime: string;
  endTime: string;
}

// State Annotation for LangGraph
export const StateAnnotation = Annotation.Root({
  businessProblem: Annotation<string>,
  strategicObjective: Annotation<string>,
  decisionType: Annotation<string>,
  extractedFacts: Annotation<ExtractedFacts>,
  runMetadata: Annotation<RunMetadata>,
  requiredMetrics: Annotation<MetricDefinition[]>,
  valueDriverTable: Annotation<string>,
  draftAssumptionTable: Annotation<string>,
  riskAdjustedAssumptionTable: Annotation<string>,
  riskToVariableMapping: Annotation<string>,
  stressScenarioDefinitions: Annotation<string>,
  finalAssumptionScenarioTable: Annotation<string>,
  metricComparisonTable: Annotation<string>,
  cashFlowSummaryTable: Annotation<string>,
  sensitivityTables: Annotation<string[]>,
  decisionFragilityTable: Annotation<string>,
  scenarioDecisionTable: Annotation<string>,
  recommendationTable: Annotation<string>,
  options: Annotation<DecisionOptions | null>,
  decisionConfig: Annotation<DecisionConfig | null>,
  errors: Annotation<ErrorRecord[]>,
  warnings: Annotation<WarningRecord[]>
});

export type CorporateFinanceState = typeof StateAnnotation.State;

// Configuration Interfaces
export interface SensitivityRange {
  [variableName: string]: [number, number];
}

export interface ScenarioNames {
  downside: string;
  base: string;
  upside: string;
}

export interface FinanceAnalysisConfig {
  scenarios: ScenarioNames;
  scenarioCount: number;
  defaultDecisionType: string;
  requiredMetricsList: string[];
  sensitivityRanges: SensitivityRange;
  modelId: string;
  temperature: number;
  maxTokens: number;
  maxRetries: number;
  tableValidation: boolean;
  outputFilenamePattern: string;
  outputDirectory: string;
}
