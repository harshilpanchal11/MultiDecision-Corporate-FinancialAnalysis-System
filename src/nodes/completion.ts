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
    
    // Convert decision_type to camelCase for filename (e.g. market_entry → marketEntry)
    const camelDecisionType = state.decisionType.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

    // Extract company name: first capitalized multi-word phrase from business problem
    const companyMatch = state.businessProblem.match(/([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*)/);
    const companyName = companyMatch
      ? companyMatch[1].replace(/\s+/g, "")
      : "Company";

    const timestamp = state.runMetadata.timestamp
      .replace(/[-:]/g, "")
      .replace("T", "_")
      .substring(0, 15);

    const filename = `${camelDecisionType}_${companyName}_${timestamp}.md`;
    
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
        if (!varName || varName.length < 3 || /^variable\s*\d+$/i.test(varName)) {
          varName = `Sensitivity Variable ${idx + 1}`;
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

    // CHECK 1 — FCF consistency (option-aware: compare within same block)
    try {
      const splitByOptionBlocks = (text: string): string[] => {
        const parts = text.split(/\n(?=\*\*[^*]+\*\*\s*$)/m);
        return parts.length > 0 ? parts : [text];
      };

      const extractCumulativeFCFFromBlock = (block: string): number | null => {
        for (const line of block.split("\n")) {
          const lower = line.toLowerCase();
          if (lower.includes("cumulative") && lower.includes("fcf") && line.includes("|")) {
            const cells = line.split("|").map(c => c.trim()).filter(Boolean);
            const headerRow = block.split("\n").find(l => l.includes("|") && /downside|base|upside/i.test(l));
            let baseIdx = -1;
            if (headerRow) {
              const headers = headerRow.split("|").map(h => h.trim().toLowerCase()).filter(Boolean);
              baseIdx = headers.findIndex(h => h === "base");
            }
            if (baseIdx >= 0 && baseIdx < cells.length) {
              const val = parseFloat(cells[baseIdx].replace(/[$,]/g, ""));
              if (!isNaN(val)) return val;
            }
            const nums = cells.slice(1).map(c => parseFloat(c.replace(/[$,%x]/g, ""))).filter(n => !isNaN(n));
            if (nums.length > 0) return nums[Math.min(1, nums.length - 1)];
          }
        }
        return null;
      };

      const extractLastCumulativeFCFFromCashFlow = (block: string): number | null => {
        const tableLines = block.split("\n").filter(l => l.includes("|"));
        const headerLine = tableLines.find(l => /cumulative|period|month/i.test(l));
        let cumIdx = -1;
        if (headerLine) {
          const headers = headerLine.split("|").map(h => h.trim().toLowerCase()).filter(Boolean);
          cumIdx = headers.findIndex(h => h.includes("cumulative"));
        }
        const dataLines = tableLines.filter(l => !/^[\s|:-]+$/.test(l.replace(/\|/g, "").trim()) && !/metric|period|month/i.test(l));
        if (dataLines.length === 0) return null;
        const lastRow = dataLines[dataLines.length - 1];
        const cells = lastRow.split("|").map(c => c.trim()).filter(Boolean);
        if (cumIdx >= 0 && cumIdx < cells.length) {
          const val = parseFloat(cells[cumIdx].replace(/[$,]/g, ""));
          if (!isNaN(val)) return val;
        }
        if (cells.length > 0) {
          const val = parseFloat(cells[cells.length - 1].replace(/[$,]/g, ""));
          if (!isNaN(val)) return val;
        }
        return null;
      };

      const metricBlocks = splitByOptionBlocks(state.metricComparisonTable);
      const cfBlocks = splitByOptionBlocks(state.cashFlowSummaryTable);
      const blockCount = Math.min(metricBlocks.length, cfBlocks.length);

      let fcfMismatch = false;
      for (let i = 0; i < blockCount; i++) {
        const metricVal = extractCumulativeFCFFromBlock(metricBlocks[i]);
        const cfVal = extractLastCumulativeFCFFromCashFlow(cfBlocks[i]);
        if (metricVal !== null && cfVal !== null) {
          const avg = (Math.abs(metricVal) + Math.abs(cfVal)) / 2;
          if (avg > 0 && Math.abs(metricVal - cfVal) / avg > 0.05) {
            fcfMismatch = true;
            break;
          }
        }
      }
      if (fcfMismatch) {
        validationWarnings.push(
          "⚠ FCF CONSISTENCY WARNING: Cumulative FCF in Metric table differs from Cash Flow table by more than 5%. Review required."
        );
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

    // CHECK 3 — Scenario variation (column-header-aware, direction-aware)
    try {
      const primaryMetricMap: Record<string, string> = {
        capital_budgeting: "npv",
        acquisition_vs_organic: "arr",
        debt_vs_equity: "wacc",
        market_entry: "break-even",
        cost_reduction: "payback"
      };
      const lowerIsBetter = new Set(["wacc", "payback", "break-even"]);
      const primaryKey = primaryMetricMap[state.decisionType] ?? "";

      if (primaryKey) {
        const metricBlocks = state.metricComparisonTable.split(/\n(?=\*\*[^*]+\*\*\s*$)/m);
        let variationOk = false;

        for (const block of metricBlocks) {
          const blockLines = block.split("\n").filter(l => l.includes("|"));
          const headerLine = blockLines.find(l => /downside|base|upside/i.test(l));
          if (!headerLine) continue;

          const headers = headerLine.split("|").map(h => h.trim().toLowerCase()).filter(Boolean);
          const dsIdx = headers.findIndex(h => h.includes("downside"));
          const baseIdx = headers.findIndex(h => h === "base");
          const upIdx = headers.findIndex(h => h.includes("upside"));
          if (dsIdx < 0 || baseIdx < 0 || upIdx < 0) continue;

          for (const line of blockLines) {
            if (!line.toLowerCase().includes(primaryKey)) continue;
            const cells = line.split("|").map(c => c.trim()).filter(Boolean);
            const dsVal = parseFloat((cells[dsIdx] ?? "").replace(/[$,%x]/g, ""));
            const baseVal = parseFloat((cells[baseIdx] ?? "").replace(/[$,%x]/g, ""));
            const upVal = parseFloat((cells[upIdx] ?? "").replace(/[$,%x]/g, ""));
            if (isNaN(dsVal) || isNaN(baseVal) || isNaN(upVal)) continue;

            const allDifferent = dsVal !== baseVal && baseVal !== upVal;
            if (allDifferent) {
              if (lowerIsBetter.has(primaryKey)) {
                if (dsVal > baseVal && baseVal > upVal) variationOk = true;
              } else {
                if (dsVal < baseVal && baseVal < upVal) variationOk = true;
              }
              if (!variationOk) {
                const spread = Math.abs(upVal - dsVal);
                const avg = (Math.abs(dsVal) + Math.abs(baseVal) + Math.abs(upVal)) / 3;
                if (avg > 0 && spread / avg > 0.05) variationOk = true;
              }
            }
            break;
          }
          if (variationOk) break;
        }

        if (!variationOk) {
          validationWarnings.push(
            "⚠ SCENARIO VARIATION WARNING: Scenarios do not vary meaningfully for primary metric."
          );
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
