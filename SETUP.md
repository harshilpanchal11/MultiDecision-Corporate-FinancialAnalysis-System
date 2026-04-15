# Setup Instructions

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Create .env File**

   Create a `.env` file in the root directory with the following content:

   ```env
   # Required: OpenAI API Key
   OPENAI_API_KEY=your_openai_api_key_here

   # Optional: LangSmith Tracing
   LANGCHAIN_API_KEY=your_langsmith_api_key_here
   LANGCHAIN_TRACING_V2=false
   LANGCHAIN_PROJECT=corporate-finance-analysis

   # Optional: Execution Environment
   NODE_ENV=development
   ```

   **Important**: Replace `your_openai_api_key_here` with your actual OpenAI API key.

3. **Build the Project**
   ```bash
   npm run build
   ```

4. **Run the Analysis**

   All three arguments are required. The system will exit with an error if any are missing or invalid.

   ```bash
   npm start -- "<business_problem>" "<strategic_objective>" "<decision_type>"
   ```

   Valid values for `decision_type`:
   - `acquisition_vs_organic`
   - `capital_budgeting`
   - `debt_vs_equity`
   - `market_entry`
   - `cost_reduction`

   **Example:**
   ```bash
   npm start -- \
     "FlowOps must choose between acquiring TaskPilot or pursuing organic growth to reach \$50M ARR within 24 months." \
     "Reach \$50M ARR within 24 months while keeping burn controllable and maintaining product quality" \
     "acquisition_vs_organic"
   ```

   **Alternatively**, run directly from a Markdown case study file using the wrapper script:
   ```bash
   npm run run-case -- TEST_CASES/CASE_STUDY_CloudSync_AgentVersion.md
   ```
   This extracts all three arguments from the case study via a single LLM call, shows them for your approval, and then launches the pipeline.

## Environment Variables Explained

### Required

- **OPENAI_API_KEY**: Your OpenAI API key. Get one at https://platform.openai.com/api-keys

### Optional

- **LANGCHAIN_API_KEY**: LangSmith API key for tracing (get at https://smith.langchain.com/)
- **LANGCHAIN_TRACING_V2**: Set to `"true"` to enable tracing (default: `"false"`)
- **LANGCHAIN_PROJECT**: Project name in LangSmith dashboard (default: `"corporate-finance-analysis"`)
- **NODE_ENV**: Set to `"development"` for verbose logging or `"production"` for minimal logs

## Troubleshooting

### "OPENAI_API_KEY is required" Error

Make sure you've created the `.env` file and added your actual OpenAI API key.

### "decision_type is required" Error

`decision_type` is a mandatory third CLI argument. Valid values are:
`acquisition_vs_organic`, `capital_budgeting`, `debt_vs_equity`, `market_entry`, `cost_reduction`

### Module Not Found Errors

Run `npm install` to ensure all dependencies are installed.

### TypeScript Compilation Errors

Run `npm run build` to compile TypeScript to JavaScript before running `npm start`.

### Output Directory Not Found

The system automatically creates the `outputs/` directory. If you see errors, check that you have write permissions in the project root.

## Next Steps

- Review `config.json` to customize global settings (model, retries, scenario names, sensitivity ranges)
- Review `src/decision-config.ts` to understand or modify per-decision-type metrics and prompts
- Check the `outputs/` directory for generated analysis Markdown reports
- Check the `debug/` directory for per-node LLM attempt logs (useful for debugging validation failures)
- Enable LangSmith tracing to monitor execution, token usage, and node-level outputs
