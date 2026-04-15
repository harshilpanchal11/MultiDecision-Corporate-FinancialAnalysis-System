import { readFileSync } from "fs";
import { FinanceAnalysisConfig } from "./types.js";
import { VALID_DECISION_TYPES } from "./decision-config.js";

/**
 * Load configuration from JSON file
 */
export function loadConfig(configPath: string = "./config.json"): FinanceAnalysisConfig {
  try {
    const configContent = readFileSync(configPath, "utf-8");
    const config: FinanceAnalysisConfig = JSON.parse(configContent);
    
    return config;
  } catch (error) {
    throw new Error(`Failed to load configuration from ${configPath}: ${error}`);
  }
}

/**
 * Validate configuration structure
 */
export function validateConfig(config: FinanceAnalysisConfig): void {
  const errors: string[] = [];
  
  if (!config.scenarios || !config.scenarios.downside || !config.scenarios.base || !config.scenarios.upside) {
    errors.push("Invalid scenarios configuration");
  }
  
  if (config.scenarioCount < 2 || config.scenarioCount > 5) {
    errors.push("scenarioCount must be between 2 and 5");
  }
  
  if (!Array.isArray(config.requiredMetricsList) || config.requiredMetricsList.length === 0) {
    errors.push("requiredMetricsList must be a non-empty array");
  }

  if (config.defaultDecisionType && !VALID_DECISION_TYPES.includes(config.defaultDecisionType as any)) {
    errors.push(`Invalid defaultDecisionType: "${config.defaultDecisionType}". Valid types: ${VALID_DECISION_TYPES.join(", ")}`);
  }
  
  if (!config.modelId || typeof config.modelId !== "string") {
    errors.push("modelId must be a non-empty string");
  }
  
  if (config.temperature < 0 || config.temperature > 2) {
    errors.push("temperature must be between 0 and 2");
  }
  
  if (config.maxTokens < 100 || config.maxTokens > 8000) {
    errors.push("maxTokens must be between 100 and 8000");
  }
  
  if (config.maxRetries < 0 || config.maxRetries > 5) {
    errors.push("maxRetries must be between 0 and 5");
  }
  
  if (!config.outputDirectory || typeof config.outputDirectory !== "string") {
    errors.push("outputDirectory must be a non-empty string");
  }
  
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join("\n")}`);
  }
}
