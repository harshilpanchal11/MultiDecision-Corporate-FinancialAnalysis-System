import { ChatOpenAI } from "@langchain/openai";
import { FinanceAnalysisConfig } from "./types.js";

/**
 * Create a ChatOpenAI LLM instance configured via OpenAI API key.
 * Centralizes all LLM initialization so provider changes only touch this file.
 */
export function createLLM(config: FinanceAnalysisConfig, temperatureOverride?: number) {
  return new ChatOpenAI({
    model: config.modelId,
    apiKey: process.env.OPENAI_API_KEY!,
    temperature: temperatureOverride ?? config.temperature,
    maxTokens: config.maxTokens,
  });
}
