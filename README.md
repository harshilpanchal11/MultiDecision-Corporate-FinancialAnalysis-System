# Multi-Agent Corporate Finance Decision Analysis System

A comprehensive multi-agent AI system that performs corporate finance decision analysis using LangGraph and OpenAI. The system produces scenario-based comparison tables that mirror real corporate finance workflows.

## Features

- **Multi-Agent Workflow**: 8 specialized nodes working together to analyze finance decisions
- **Decision-Type Aware**: 5 distinct decision types, each with tailored metrics, prompts, and sensitivity variables
- **Scenario-Based Analysis**: Downside, Base, and Upside scenario modeling
- **Structured Output**: All outputs are Markdown tables (no narrative-only content)
- **LangSmith Integration**: Full tracing support for debugging and analysis
- **Type-Safe**: Strict TypeScript with comprehensive type definitions
- **Error Handling**: Graceful degradation with clear error reporting

## Architecture

The system follows a multi-agent workflow:

```
Start Node (Validation)
    ↓
Strategy/Fundamentals Node (Define what matters)
    ↓
Risk Node - Assumption Challenge (Eliminate false precision)
    ↓
Finance Lead Node (Lock assumptions)
    ↓
Financial Modeling Node (Translate to metrics)
    ↓
Risk Node - Stress Testing (Reveal drivers)
    ↓
Decision/Integration Node (Make recommendation)
    ↓
Completion Node (Generate final file)
```

## Prerequisites

- Node.js 20+ (LTS recommended)
- npm
- OpenAI API key

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd Corporate-Financial-Analysis-Agent
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:

   Create a `.env` file in the root directory (see `.env.example` for template):
   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   ```

   **Note**: The `.env` file is not created automatically for security reasons. You must create it manually.

   See `SETUP.md` for detailed setup instructions.

Optional: For LangSmith tracing:
```
LANGCHAIN_API_KEY=your_langsmith_api_key_here
LANGCHAIN_TRACING_V2=true
LANGCHAIN_PROJECT=corporate-finance-analysis
```

## Configuration

Edit `config.json` to customize global run settings:
- Scenario names (Downside / Base Case / Upside)
- Required metrics list
- Sensitivity analysis ranges
- OpenAI model and token settings (`gpt-4o` by default)
- Output directory and filename pattern

Decision-type-specific behavior — metrics, value driver hints, assumption variables, and per-node system prompts — is defined in `src/decision-config.ts`.

## Usage

All three arguments are **required**. The system will exit with an error if any are missing or invalid.

### Basic Usage

```bash
npm run build
npm start -- "<business_problem>" "<strategic_objective>" "<decision_type>"
```

### Development Mode

```bash
npm run dev -- "<business_problem>" "<strategic_objective>" "<decision_type>"
```

### Command Line Arguments

| # | Argument | Required | Description |
|---|----------|----------|-------------|
| 1 | `business_problem` | Yes | The finance decision to analyze (min 10 characters) |
| 2 | `strategic_objective` | Yes | The guiding decision criterion with measurable targets |
| 3 | `decision_type` | Yes | One of the 5 valid decision types (see table below) |

## Decision Type Reference

| `decision_type` | When to Use | Example |
|-----------------|-------------|---------|
| `acquisition_vs_organic` | Choosing between acquiring a company vs growing internally | Acquire TaskPilot or grow to $50M ARR organically? |
| `capital_budgeting` | Evaluating a specific capital investment or project | Invest $15M in new manufacturing line? |
| `debt_vs_equity` | Deciding how to raise capital | Issue bonds at 6.5% or a secondary equity offering? |
| `market_entry` | Evaluating entry into a new market or geography | Enter Southeast Asian market with $8M investment? |
| `cost_reduction` | Evaluating a cost-cutting or efficiency initiative | Automate data workflows for $4M to save $2.5M/year? |

### Examples by Decision Type

```bash
# Acquisition vs Organic Growth
npm start -- \
  "FlowOps must choose between acquiring TaskPilot or pursuing organic growth to reach \$50M ARR within 24 months while keeping burn controllable." \
  "Reach \$50M ARR within 24 months while keeping burn controllable and maintaining product quality" \
  "acquisition_vs_organic"

# Capital Budgeting
npm start -- \
  "TechCorp is evaluating a \$15M investment in a new automated manufacturing line that would increase production capacity by 40% and reduce per-unit costs by 25% over a 5-year horizon." \
  "Achieve positive NPV with IRR above 15% hurdle rate and payback within 3 years" \
  "capital_budgeting"

# Debt vs Equity
npm start -- \
  "GlobalTech needs to raise \$50M to fund its expansion and must decide between issuing corporate bonds at 6.5% or a secondary equity offering at \$45/share." \
  "Minimize WACC while maintaining investment-grade credit rating and limiting EPS dilution below 10%" \
  "debt_vs_equity"

# Market Entry
npm start -- \
  "CloudServe is evaluating entry into the Southeast Asian market with an estimated TAM of \$2B and 12% annual growth, requiring \$8M initial investment." \
  "Achieve 2% market share within 3 years with positive ROI and break-even within 24 months" \
  "market_entry"

# Cost Reduction
npm start -- \
  "DataFlow is considering a company-wide automation initiative replacing manual workflows, requiring \$4M upfront investment expected to reduce operational costs by \$2.5M annually." \
  "Achieve payback within 18 months with sustained annual savings of at least \$2M and minimal disruption to operations" \
  "cost_reduction"
```

## Running from a Case Study File

Use `scripts/run-case.mjs` to run a case study from a `.md` file. This wrapper makes a single OpenAI call to extract the three required CLI arguments from the case study text, previews them for your approval, and then launches the pipeline.

```bash
npm run run-case -- <path-to-case-study.md>
```

**Example:**
```bash
npm run run-case -- TEST_CASES/CASE_STUDY_CloudSync_AgentVersion.md
```

The wrapper will:
1. Read the case study file
2. Extract `business_problem`, `strategic_objective`, and `decision_type` via a single LLM call
3. Display the extracted values for review
4. Prompt you to approve or manually edit any field before running
5. Execute the full multi-agent pipeline

## Output

The system generates a Markdown file in the `outputs/` directory containing:

- Value Drivers table
- Assumptions & Scenarios table
- Metric Comparison table
- Cash Flow Summary table
- Sensitivity Analysis tables
- Decision Fragility table
- Scenario Decision table
- Final Recommendation table

Debug logs for each node's LLM attempts are written to the `debug/` directory.

## Project Structure

```
Corporate-Financial-Analysis-Agent/
├── src/
│   ├── index.ts               # Main entry point
│   ├── types.ts               # State and config interfaces
│   ├── config.ts              # Config loading
│   ├── graph.ts               # Graph construction
│   ├── decision-config.ts     # Per-decision-type metrics, prompts, hints
│   ├── nodes/
│   │   ├── start.ts
│   │   ├── strategy.ts
│   │   ├── risk-challenge.ts
│   │   ├── finance-lead.ts
│   │   ├── modeling.ts
│   │   ├── risk-stress.ts
│   │   ├── decision.ts
│   │   └── completion.ts
│   └── utils/
│       ├── table-parser.ts
│       ├── validators.ts
│       └── logger.ts
├── scripts/
│   └── run-case.mjs           # Case-study wrapper CLI
├── TEST_CASES/                # Markdown case study files
├── outputs/                   # Generated analysis reports
├── debug/                     # Per-node LLM attempt logs
├── dist/                      # Compiled JavaScript output
├── config.json                # Global run configuration
├── .env                       # Environment variables (not in git)
├── .env.example               # Example environment variables
├── package.json
├── tsconfig.json
├── SETUP.md
└── README.md
```

## Development

### Build

```bash
npm run build
```

### Type Check

```bash
npm run type-check
```

### Environment Variables

- `OPENAI_API_KEY` (required): Your OpenAI API key
- `LANGCHAIN_API_KEY` (optional): LangSmith API key for tracing
- `LANGCHAIN_TRACING_V2` (optional): Set to `"true"` to enable tracing
- `LANGCHAIN_PROJECT` (optional): Project name in LangSmith (default: `"corporate-finance-analysis"`)
- `NODE_ENV` (optional): `"development"` for verbose logging, `"production"` for minimal logs

## Error Handling

The system includes comprehensive error handling:

- **Fatal Errors**: Halt execution immediately (e.g., missing API key, invalid or missing `decision_type`, inputs below minimum length)
- **Validation Errors**: Retry once, then proceed or halt
- **Business Logic Errors**: Warnings, proceed with caution

All errors are logged and included in the final output file.

## LangSmith Tracing

When enabled, all LLM calls and node executions are traced in LangSmith. This allows you to:

- Review prompts and outputs for each node
- Identify bottlenecks
- Debug validation failures
- Track token usage and costs

## License

MIT

## Contributing

Contributions are welcome! Please ensure all code follows the TypeScript strict mode and includes proper error handling.
