# Multi-Agent Corporate Finance Decision Analysis System

A comprehensive multi-agent AI system that performs corporate finance decision analysis using LangGraph and OpenAI. The system produces scenario-based comparison tables that mirror real corporate finance workflows.

## Features

- **Multi-Agent Workflow**: 8 specialized nodes working together to analyze finance decisions
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
- npm or yarn
- OpenAI API key

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd Corp-finance-agents
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

Edit `config.json` to customize:
- Scenario names
- Required metrics
- Sensitivity analysis ranges
- OpenAI model settings
- Output directory

## Usage

### Basic Usage

```bash
npm run build
npm start "Should we expand to European market?" "Maximize NPV while limiting downside risk"
```

### Development Mode

```bash
npm run dev "Your business problem" "Your strategic objective"
```

### Testing with Case Study

A case study is included: **"Case study acq vs growth.docx"** - FlowOps acquisition vs organic growth decision.

**Quick test:**
```bash
# Option 1: Use the test script
./test-case-study.sh

# Option 2: Run manually
npm run build
node dist/index.js \
  "FlowOps must choose between acquiring TaskPilot or pursuing organic growth to reach \$50M ARR within 24 months while keeping burn controllable and maintaining product quality." \
  "Reach \$50M ARR within 24 months while keeping burn controllable and maintaining product quality"
```

See `TEST-CASE-STUDY.md` for detailed instructions and expected outputs.

### Command Line Arguments

1. **Business Problem** (required): The finance decision to analyze
2. **Strategic Objective** (required): The guiding decision criterion

If not provided, defaults will be used.

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

## Project Structure

```
Corp-finance-agents/
├── src/
│   ├── index.ts           # Main entry point
│   ├── types.ts           # State and config interfaces
│   ├── config.ts          # Config loading
│   ├── graph.ts           # Graph construction
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
├── config.json            # Default configuration
├── .env                   # Environment variables (not in git)
├── .env.example           # Example environment variables
├── package.json
├── tsconfig.json
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
- `LANGCHAIN_TRACING_V2` (optional): Set to "true" to enable tracing
- `LANGCHAIN_PROJECT` (optional): Project name in LangSmith
- `NODE_ENV` (optional): "development" or "production"

## Error Handling

The system includes comprehensive error handling:

- **Fatal Errors**: Halt execution immediately (e.g., missing API key, invalid inputs)
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
