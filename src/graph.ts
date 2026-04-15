import { StateGraph, START, END } from "@langchain/langgraph";
import { StateAnnotation } from "./types.js";
import { FinanceAnalysisConfig } from "./types.js";
import { createStartNode } from "./nodes/start.js";
import { createStrategyNode } from "./nodes/strategy.js";
import { createRiskChallengeNode } from "./nodes/risk-challenge.js";
import { createFinanceLeadNode } from "./nodes/finance-lead.js";
import { createModelingNode } from "./nodes/modeling.js";
import { createRiskStressNode } from "./nodes/risk-stress.js";
import { createDecisionNode } from "./nodes/decision.js";
import { createCompletionNode } from "./nodes/completion.js";
import { CorporateFinanceState } from "./types.js";

/**
 * Conditional routing function - checks if workflow should proceed
 */
function shouldProceedToNextNode(state: CorporateFinanceState): "continue" | "error" {
  const hasFatalErrors = state.errors.some(e => e.errorType === "fatal");
  return hasFatalErrors ? "error" : "continue";
}

/**
 * Build and compile the LangGraph workflow
 */
export function buildGraph(config: FinanceAnalysisConfig) {
  // Create all nodes
  const startNode = createStartNode(config);
  const strategyNode = createStrategyNode(config);
  const riskChallengeNode = createRiskChallengeNode(config);
  const financeLeadNode = createFinanceLeadNode(config);
  const modelingNode = createModelingNode(config);
  const riskStressNode = createRiskStressNode(config);
  const decisionNode = createDecisionNode(config);
  const completionNode = createCompletionNode(config);
  
  // Build graph
  const graph = new StateGraph(StateAnnotation)
    .addNode("start", startNode)
    .addNode("strategy", strategyNode)
    .addNode("risk_challenge", riskChallengeNode)
    .addNode("finance_lead", financeLeadNode)
    .addNode("modeling", modelingNode)
    .addNode("risk_stress", riskStressNode)
    .addNode("decision", decisionNode)
    .addNode("completion", completionNode)
    .addEdge(START, "start")
    .addEdge("start", "strategy")
    .addEdge("strategy", "risk_challenge")
    .addConditionalEdges("risk_challenge", shouldProceedToNextNode, {
      continue: "finance_lead",
      error: "completion"
    })
    .addConditionalEdges("finance_lead", shouldProceedToNextNode, {
      continue: "modeling",
      error: "completion"
    })
    .addConditionalEdges("modeling", shouldProceedToNextNode, {
      continue: "risk_stress",
      error: "completion"
    })
    .addConditionalEdges("risk_stress", shouldProceedToNextNode, {
      continue: "decision",
      error: "completion"
    })
    .addEdge("decision", "completion")
    .addEdge("completion", END);
  
  return graph.compile();
}
