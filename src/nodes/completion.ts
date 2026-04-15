import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { CorporateFinanceState, ErrorRecord } from "../types.js";
import { FinanceAnalysisConfig } from "../types.js";
import { log, warn, error } from "../utils/logger.js";
import { getDecisionTypeConfig } from "../decision-config.js";

/**
 * Completion Node - Generates final Markdown output file.
 * Output format adapts based on decision_type.
 */
export function createCompletionNode(config: FinanceAnalysisConfig) {
  return async (state: CorporateFinanceState): Promise<Partial<CorporateFinanceState>> => {
    log("Completion Node: Generating final output file...");
    
    const endTime = new Date().toISOString();
    const updatedMetadata = { ...state.runMetadata, endTime };
    const dtConfig = getDecisionTypeConfig(state.decisionType);
    
    const requiredTables = [
      { name: "valueDriverTable", value: state.valueDriverTable },
      { name: "finalAssumptionScenarioTable", value: state.finalAssumptionScenarioTable },
      { name: "metricComparisonTable", value: state.metricComparisonTable },
      { name: "cashFlowSummaryTable", value: state.cashFlowSummaryTable },
      { name: "decisionFragilityTable", value: state.decisionFragilityTable },
      { name: "scenarioDecisionTable", value: state.scenarioDecisionTable },
      { name: "recommendationTable", value: state.recommendationTable }
    ];
    
    const missingTables = requiredTables.filter(t => !t.value || t.value.trim().length === 0);
    const hasErrors = state.errors.some(e => e.errorType === "fatal");
    
    const sanitizedProblem = state.businessProblem
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "_")
      .substring(0, 50);
    
    const timestamp = state.runMetadata.timestamp
      .replace(/[-:]/g, "")
      .replace("T", "_")
      .substring(0, 15);
    
    const filename = config.outputFilenamePattern
      .replace("{businessProblem}", sanitizedProblem)
      .replace("{timestamp}", timestamp);
    
    let markdownContent = "";
    
    if (hasErrors || missingTables.length > 0) {
      markdownContent = `# Corporate Finance Analysis: ${state.businessProblem}

## Analysis Status: INCOMPLETE

**Decision Type:** ${dtConfig.label}

This analysis encountered errors and could not be completed.

---

## Errors Encountered

| Node | Error Type | Message | Timestamp |
|------|------------|---------|-----------|
${state.errors.map(e => `| ${e.nodeId} | ${e.errorType} | ${e.message} | ${e.timestamp} |`).join("\n")}

---

## Warnings

${state.warnings.length > 0 ? `| Node | Message | Timestamp |\n|------|---------|-----------|\n${state.warnings.map(w => `| ${w.nodeId} | ${w.message} | ${w.timestamp} |`).join("\n")}` : "No warnings."}

---

## Completed Analysis (Before Errors)

${state.valueDriverTable ? "### Value Drivers\n" + state.valueDriverTable + "\n\n" : ""}
${state.draftAssumptionTable ? "### Draft Assumptions\n" + state.draftAssumptionTable + "\n\n" : ""}
${state.riskAdjustedAssumptionTable ? "### Risk-Adjusted Assumptions\n" + state.riskAdjustedAssumptionTable + "\n\n" : ""}

---

## Missing Sections

${missingTables.map(t => `- ${t.name}`).join("\n")}

---

*Analysis failed: ${endTime}*
*Run ID: ${state.runMetadata.runId}*
*Decision Type: ${dtConfig.label}*
`;
    } else {
      const isMulti = state.options?.type === "multi";
      const choiceNames = state.options?.choices ?? ["yes", "no"];

      let alternativesSection = "";
      if (isMulti) {
        const choiceHeaders = choiceNames.map(c => `### ${c}`).join("\n");
        alternativesSection = `## Strategic Alternatives Comparison

**This analysis compares the following strategic paths:**

${choiceHeaders}

**Analysis Approach:** Each path is modeled using its respective assumptions. The scenarios (Downside/Base/Upside) represent different outcomes for each path based on assumption variations.

---

`;
      }

      // Build sensitivity section
      const sensitivitySection = state.sensitivityTables.map((table, idx) => {
        const varNameMatch = table.match(/\*\*Variable Name:\s*([^*]+)\*\*/i) || 
                             table.match(/\*\*Variable Name:\s*([^\n]+)/i) ||
                             table.match(/Variable Name:\s*([^\n|]+)/i) ||
                             table.match(/###\s*([^\n]+)/i);
        let varName = varNameMatch ? varNameMatch[1].trim() : null;
        
        if (!varName) {
          const firstLine = table.split('\n')[0];
          if (firstLine && !firstLine.includes('|')) {
            varName = firstLine.replace(/[#*]/g, '').trim();
          }
        }
        if (!varName || varName.length < 3) {
          varName = `Variable ${idx + 1}`;
        }
        
        let cleanTable = table;
        if (varNameMatch) {
          cleanTable = table.replace(varNameMatch[0], '').trim();
        }
        
        return `### ${varName}\n\n${cleanTable}\n`;
      }).join("\n");

      const metricNote = isMulti
        ? "If multiple tables are shown above, they represent different alternatives. Compare metrics across alternatives to inform the decision."
        : "Metrics are shown for Downside, Base, and Upside scenarios.";

      const cashFlowNote = isMulti
        ? "If multiple tables are shown above, they represent different alternatives."
        : "Cash flows shown for Downside, Base, and Upside scenarios.";

      markdownContent = `# Corporate Finance Analysis: ${state.businessProblem}

**Strategic Objective:** ${state.strategicObjective}
**Decision Type:** ${dtConfig.label}
**Analysis Date:** ${state.runMetadata.timestamp}
**Run ID:** ${state.runMetadata.runId}

---

## 1. Value Drivers

${state.valueDriverTable}

---

## 2. Draft Assumption Ranges

${state.draftAssumptionTable || "Not available"}

---

## 3. Risk-Adjusted Assumptions

${state.riskAdjustedAssumptionTable || "Not available"}

---

## 4. Risk-to-Variable Mapping

${state.riskToVariableMapping || "Not available"}

---

## 5. Stress Scenario Definitions

${state.stressScenarioDefinitions || "Not available"}

---

## 6. Final Locked Assumptions

${state.finalAssumptionScenarioTable}

---

${alternativesSection}## 7. Metric Comparison

${state.metricComparisonTable}

**Note:** ${metricNote}

---

## 8. Cash Flow Summary

${state.cashFlowSummaryTable}

**Note:** ${cashFlowNote}

---

## 9. Sensitivity Analysis

${sensitivitySection}

---

## 10. Decision Fragility

${state.decisionFragilityTable}

---

## 11. Scenario Decision

${state.scenarioDecisionTable}

---

## 12. Final Recommendation

${state.recommendationTable}

---

*Analysis completed: ${endTime}*
*Model used: ${state.runMetadata.modelUsed}*
*Decision Type: ${dtConfig.label}*
*Scenarios analyzed: ${state.runMetadata.scenarioCount}*
`;
    }
    
    // ── Validation checks (warnings prepended to output, never halt) ──

    const validationWarnings: string[] = [];

    // CHECK 1 — FCF consistency
    try {
      const extractCumulativeFCF = (text: string, label: string): number | null => {
        const lines = text.split("\n");
        for (const line of lines) {
          const lower = line.toLowerCase();
          if (lower.includes("cumulative") && lower.includes("fcf")) {
            const nums = line.match(/[-\$]?[\d,]+\.?\d*/g);
            if (nums && nums.length > 0) {
              const last = nums[nums.length - 1].replace(/[$,]/g, "");
              const val = parseFloat(last);
              if (!isNaN(val)) return val;
            }
          }
        }
        return null;
      };
      const metricCumFCF = extractCumulativeFCF(state.metricComparisonTable, "metric");
      const cfLines = state.cashFlowSummaryTable.split("\n").filter(l => l.includes("|"));
      let cashFlowCumFCF: number | null = null;
      if (cfLines.length > 2) {
        const lastRow = cfLines[cfLines.length - 1];
        const cells = lastRow.split("|").map(c => c.trim()).filter(Boolean);
        const lastCell = cells[cells.length - 1];
        if (lastCell) {
          const val = parseFloat(lastCell.replace(/[$,]/g, ""));
          if (!isNaN(val)) cashFlowCumFCF = val;
        }
      }
      if (metricCumFCF !== null && cashFlowCumFCF !== null) {
        const avg = (Math.abs(metricCumFCF) + Math.abs(cashFlowCumFCF)) / 2;
        if (avg > 0 && Math.abs(metricCumFCF - cashFlowCumFCF) / avg > 0.05) {
          validationWarnings.push(
            "⚠ FCF CONSISTENCY WARNING: Cumulative FCF in Metric table differs from Cash Flow table by more than 5%. Review required."
          );
        }
      }
    } catch { /* non-fatal */ }

    // CHECK 2 — Metric completeness
    if (state.decisionConfig?.metrics) {
      for (const m of state.decisionConfig.metrics) {
        if (!markdownContent.toLowerCase().includes(m.name.toLowerCase())) {
          validationWarnings.push(`⚠ MISSING METRIC WARNING: [${m.name}] not found in output.`);
        }
      }
    }

    // CHECK 3 — Scenario variation
    try {
      const primaryMetricMap: Record<string, string> = {
        capital_budgeting: "npv",
        acquisition_vs_organic: "arr",
        debt_vs_equity: "wacc",
        market_entry: "break-even",
        cost_reduction: "payback"
      };
      const primaryKey = primaryMetricMap[state.decisionType] ?? "";
      if (primaryKey) {
        const metricLines = state.metricComparisonTable.split("\n");
        for (const line of metricLines) {
          if (line.toLowerCase().includes(primaryKey) && line.includes("|")) {
            const cells = line.split("|").map(c => c.trim()).filter(Boolean);
            const nums = cells.slice(1).map(c => parseFloat(c.replace(/[$,%x]/g, ""))).filter(n => !isNaN(n));
            if (nums.length >= 3) {
              const [downside, base, upside] = [nums[nums.length - 3], nums[nums.length - 2], nums[nums.length - 1]];
              if (downside >= base || upside <= base) {
                validationWarnings.push(
                  "⚠ SCENARIO VARIATION WARNING: Scenarios do not vary meaningfully for primary metric."
                );
              }
            }
            break;
          }
        }
      }
    } catch { /* non-fatal */ }

    // CHECK 4 — Placeholder detection
    const placeholders = ["[value]", "[calc]", "[impact]", "[metric]", "[name]"];
    if (placeholders.some(p => markdownContent.includes(p))) {
      validationWarnings.push(
        "⚠ INCOMPLETE OUTPUT WARNING: Unfilled placeholders detected. Tables may be incomplete."
      );
    }

    // CHECK 5 — Option label check (only in analysis tables, not in user-provided text)
    const tableSections = [
      state.metricComparisonTable,
      state.cashFlowSummaryTable,
      state.scenarioDecisionTable,
      state.recommendationTable,
      state.decisionFragilityTable,
      ...(state.sensitivityTables || [])
    ].join("\n");
    if (tableSections.includes("Option A") || tableSections.includes("Option B")) {
      validationWarnings.push(
        "⚠ HARDCODED LABEL WARNING: 'Option A' or 'Option B' found in output. Dynamic choice names were not applied correctly."
      );
    }

    if (validationWarnings.length > 0) {
      validationWarnings.forEach(w => warn(`Completion Node: ${w}`));
    }

    let filePath = "";
    try {
      await mkdir(config.outputDirectory, { recursive: true });
      filePath = join(config.outputDirectory, filename);
      await writeFile(filePath, markdownContent, "utf-8");
      log(`Output file written: ${filePath}`);
    } catch (err) {
      error(`Failed to write output file: ${err}`);
      const fileError: ErrorRecord = {
        nodeId: "completion",
        errorType: "fatal",
        message: `Failed to write output file: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date().toISOString()
      };
      return { ...state, runMetadata: updatedMetadata, errors: [...state.errors, fileError] };
    }
    
    return { ...state, runMetadata: updatedMetadata };
  };
}
