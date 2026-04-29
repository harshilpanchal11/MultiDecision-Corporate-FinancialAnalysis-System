#!/usr/bin/env node

/**
 * Case-Study Wrapper CLI
 *
 * Reads a case-study .md file, calls OpenAI ONCE to extract the three
 * CLI arguments (business_problem, strategic_objective, decision_type),
 * asks for user approval, then executes the multi-agent pipeline.
 *
 * Usage:
 *   node scripts/run-case.mjs <path-to-case-study.md>
 *   node scripts/run-case.mjs ../TEST_CASES/CASE_STUDY_CloudSync_AgentVersion.md
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { resolve, dirname, join, basename } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";
import { exec } from "child_process";
import dotenv from "dotenv";
import OpenAI from "openai";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const INPUTS_DIR = resolve(PROJECT_ROOT, "inputs");

dotenv.config({ path: resolve(PROJECT_ROOT, ".env") });

const VALID_DECISION_TYPES = [
  "capital_budgeting",
  "acquisition_vs_organic",
  "debt_vs_equity",
  "market_entry",
  "cost_reduction",
];

const EXTRACTION_PROMPT = `You are helping prepare inputs for a corporate finance multi-agent analysis system.

From the case study below, extract EXACTLY three strings that will be used as CLI arguments.

STRING 1 — BUSINESS PROBLEM:
- 2-3 sentences maximum
- Must capture: WHO the company is, WHAT decision or challenge they face, the KEY CONSTRAINT (budget, burn, timeline, risk, interest rate, etc.), and the END GOAL (revenue, market share, ARR, etc.)
- Do NOT force a rigid format — let the language flow naturally from what the case study actually says
- If the case study involves comparing two options, name both options naturally in the sentence
- If it is a single path decision (e.g. should we enter this market), frame it as an evaluation

STRING 2 — STRATEGIC OBJECTIVE:
- 2 sentence maximum
- Must include ALL measurable success criteria from the case study (numbers, %, $, timeframes)
- Do NOT force a rigid format — write it as a natural objective statement that reflects the case study's actual goals
- If multiple criteria exist (e.g. market share AND profitability AND timeline), include all of them

STRING 3 — DECISION TYPE:
- Pick exactly ONE from this list based on what the case study is about:
  - acquisition_vs_organic — company choosing between acquiring vs growing internally
  - capital_budgeting — evaluating a specific capital investment or project
  - debt_vs_equity — deciding how to raise capital (debt or equity)
  - market_entry — evaluating entry into a new market or geography
  - cost_reduction — evaluating a cost-cutting or efficiency initiative

Return ONLY valid JSON with exactly these three keys:
{
  "business_problem": "...",
  "strategic_objective": "...",
  "decision_type": "..."
}

No markdown, no code fences, no commentary — ONLY the JSON object.`;

// ── Helpers ──────────────────────────────────────────────────────────

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (ans) => { rl.close(); res(ans.trim()); }));
}

function printDivider() {
  console.log("─".repeat(70));
}

function printField(label, value) {
  console.log(`\x1b[36m${label}:\x1b[0m`);
  console.log(`  ${value}`);
}

function shellEscape(s) {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function camelDecisionType(dt) {
  return dt.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function pascalCompanyName(businessProblem) {
  const m = businessProblem.match(/([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*)/);
  return m ? m[1].replace(/\s+/g, "") : "Company";
}

function timestampNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function buildInputFilename(decisionType, businessProblem) {
  return `approved_inputs_${camelDecisionType(decisionType)}_${pascalCompanyName(businessProblem)}_${timestampNow()}.txt`;
}

async function saveApprovedInputs(filepath, bp, so, dt, sourceCase) {
  const content = [
    "=== BUSINESS_PROBLEM ===",
    bp,
    "",
    "=== STRATEGIC_OBJECTIVE ===",
    so,
    "",
    "=== DECISION_TYPE ===",
    dt,
    "",
    "=== METADATA ===",
    `approved_at=${new Date().toISOString()}`,
    `source_case_file=${sourceCase}`,
    ""
  ].join("\n");
  await mkdir(dirname(filepath), { recursive: true });
  await writeFile(filepath, content, "utf-8");
}

async function readApprovedInputs(filepath) {
  const text = await readFile(filepath, "utf-8");
  const sections = {};
  let current = null;
  let buffer = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^=== (.+) ===$/);
    if (m) {
      if (current) sections[current] = buffer.join("\n").trim();
      current = m[1];
      buffer = [];
    } else if (current) {
      buffer.push(line);
    }
  }
  if (current) sections[current] = buffer.join("\n").trim();
  return {
    businessProblem: sections.BUSINESS_PROBLEM ?? "",
    strategicObjective: sections.STRATEGIC_OBJECTIVE ?? "",
    decisionType: sections.DECISION_TYPE ?? ""
  };
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  // 1. Parse CLI input
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node scripts/run-case.mjs <path-to-case-study.md>");
    process.exit(1);
  }

  const absPath = resolve(filePath);

  // 2. Read case-study file
  let caseText;
  try {
    caseText = await readFile(absPath, "utf-8");
  } catch (err) {
    console.error(`Error reading file: ${absPath}\n${err.message}`);
    process.exit(1);
  }

  if (caseText.trim().length < 50) {
    console.error("Case study file is too short (< 50 chars). Aborting.");
    process.exit(1);
  }

  console.log(`\nRead case study: ${absPath} (${caseText.length} chars)\n`);

  // 3. Validate API key
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY not set. Check .env in project root.");
    process.exit(1);
  }

  // 4. Single OpenAI call
  console.log("Extracting inputs from case study (single LLM call)...\n");

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  let rawContent;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.1,
      max_tokens: 600,
      messages: [
        { role: "system", content: EXTRACTION_PROMPT },
        { role: "user", content: caseText },
      ],
    });
    rawContent = response.choices[0]?.message?.content ?? "";
  } catch (err) {
    console.error(`OpenAI API error: ${err.message}`);
    process.exit(1);
  }

  // 5. Parse JSON
  let extracted;
  try {
    const cleaned = rawContent.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
    extracted = JSON.parse(cleaned);
  } catch {
    console.error("Failed to parse LLM response as JSON:");
    console.error(rawContent);
    process.exit(1);
  }

  let { business_problem, strategic_objective, decision_type } = extracted;

  // 6. Validate fields
  const errors = [];
  if (!business_problem || business_problem.length < 10) {
    errors.push("business_problem is missing or too short (< 10 chars).");
  }
  if (!strategic_objective || strategic_objective.length < 10) {
    errors.push("strategic_objective is missing or too short (< 10 chars).");
  }
  if (!VALID_DECISION_TYPES.includes(decision_type)) {
    errors.push(`decision_type "${decision_type}" is invalid. Must be one of: ${VALID_DECISION_TYPES.join(", ")}`);
  }

  if (errors.length > 0) {
    console.error("Validation failed:");
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  // 7. Preview
  printDivider();
  console.log("\x1b[33m  EXTRACTED CLI INPUTS\x1b[0m\n");
  printField("Business Problem", business_problem);
  console.log();
  printField("Strategic Objective", strategic_objective);
  console.log();
  printField("Decision Type", decision_type);
  printDivider();

  const previewCmd = `npm start -- ${shellEscape(business_problem)} ${shellEscape(strategic_objective)} ${shellEscape(decision_type)}`;

  console.log("\n\x1b[90mCommand that will be executed:\x1b[0m");
  console.log(`  ${previewCmd}\n`);

  // 8. Approval loop
  const approval = await ask("Approve and run? (y/n): ");

  if (approval.toLowerCase() !== "y") {
    console.log("\nYou can edit any field below. Press Enter to keep the current value.\n");

    const editedBp = await ask(`Business Problem [Enter to keep]:\n  > `);
    if (editedBp) business_problem = editedBp;

    const editedSo = await ask(`Strategic Objective [Enter to keep]:\n  > `);
    if (editedSo) strategic_objective = editedSo;

    const editedDt = await ask(`Decision Type (${VALID_DECISION_TYPES.join(" | ")}) [Enter to keep]:\n  > `);
    if (editedDt) {
      if (!VALID_DECISION_TYPES.includes(editedDt)) {
        console.error(`Invalid decision_type: "${editedDt}". Aborting.`);
        process.exit(1);
      }
      decision_type = editedDt;
    }

    printDivider();
    console.log("\x1b[33m  UPDATED INPUTS\x1b[0m\n");
    printField("Business Problem", business_problem);
    console.log();
    printField("Strategic Objective", strategic_objective);
    console.log();
    printField("Decision Type", decision_type);
    printDivider();

    const confirm = await ask("Run with these inputs? (y/n): ");
    if (confirm.toLowerCase() !== "y") {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  // 9. Save approved inputs to a .txt file
  const inputFilename = buildInputFilename(decision_type, business_problem);
  const inputFilePath = join(INPUTS_DIR, inputFilename);
  await saveApprovedInputs(
    inputFilePath,
    business_problem,
    strategic_objective,
    decision_type,
    basename(absPath)
  );
  console.log(`\nApproved inputs saved to: ${inputFilePath}`);

  // 10. Read inputs back from the saved file (single source of truth)
  const loaded = await readApprovedInputs(inputFilePath);
  if (!loaded.businessProblem || !loaded.strategicObjective || !VALID_DECISION_TYPES.includes(loaded.decisionType)) {
    console.error(`Failed to load valid inputs from saved file: ${inputFilePath}`);
    process.exit(1);
  }

  const finalCmd = `npm start -- ${shellEscape(loaded.businessProblem)} ${shellEscape(loaded.strategicObjective)} ${shellEscape(loaded.decisionType)}`;

  // 11. Execute pipeline using the inputs read from the saved file
  console.log("\nStarting multi-agent pipeline (inputs loaded from saved file)...\n");

  const child = exec(finalCmd, { cwd: PROJECT_ROOT, maxBuffer: 50 * 1024 * 1024 });

  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

main();
