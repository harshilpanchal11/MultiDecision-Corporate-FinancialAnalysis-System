/**
 * Logger utility with environment-based verbosity
 */
const isDevelopment = process.env.NODE_ENV === "development";
const DEBUG_LLM = process.env.DEBUG_LLM === "true" || isDevelopment;

/**
 * Save LLM responses to file for debugging.
 * Only active when DEBUG_LLM_FILES=true is explicitly set.
 */
async function saveLLMResponse(nodeId: string, responseText: string, attempt: number): Promise<void> {
  if (process.env.DEBUG_LLM_FILES !== "true") return;

  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const debugDir = path.join(process.cwd(), "debug");
    await fs.mkdir(debugDir, { recursive: true });

    const filename = `${nodeId}_attempt_${attempt}_${Date.now()}.txt`;
    const filepath = path.join(debugDir, filename);
    await fs.writeFile(filepath, responseText, "utf-8");
    console.log(`[DEBUG] Saved LLM response to: ${filepath}`);
  } catch (err) {
    console.error(`[DEBUG] Failed to save LLM response: ${err}`);
  }
}

export function log(message: string, ...args: unknown[]): void {
  console.log(message, ...args);
}

export function error(message: string, ...args: unknown[]): void {
  console.error(`[ERROR] ${message}`, ...args);
}

export function warn(message: string, ...args: unknown[]): void {
  console.warn(`[WARN] ${message}`, ...args);
}

export function debug(message: string, ...args: unknown[]): void {
  if (isDevelopment || DEBUG_LLM) {
    console.debug(`[DEBUG] ${message}`, ...args);
  }
}

export function info(message: string, ...args: unknown[]): void {
  console.info(`[INFO] ${message}`, ...args);
}

/**
 * Log LLM response for debugging
 */
export async function logLLMResponse(nodeId: string, responseText: string, attempt: number = 1): Promise<void> {
  if (DEBUG_LLM) {
    debug(`[LLM Response - ${nodeId}] Attempt ${attempt}, Length: ${responseText.length} chars`);
    debug(`[LLM Response - ${nodeId}] First 500 chars: ${responseText.substring(0, 500)}`);
    
    // Save to file
    await saveLLMResponse(nodeId, responseText, attempt);
  }
}
