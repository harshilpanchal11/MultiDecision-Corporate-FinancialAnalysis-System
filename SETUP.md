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
   ```bash
   npm start "Should we expand to European market?" "Maximize NPV while limiting downside risk"
   ```

## Environment Variables Explained

### Required

- **OPENAI_API_KEY**: Your OpenAI API key. Get one at https://platform.openai.com/api-keys

### Optional

- **LANGCHAIN_API_KEY**: LangSmith API key for tracing (get at https://smith.langchain.com/)
- **LANGCHAIN_TRACING_V2**: Set to "true" to enable tracing (default: "false")
- **LANGCHAIN_PROJECT**: Project name in LangSmith dashboard (default: "corporate-finance-analysis")
- **NODE_ENV**: Set to "development" for verbose logging or "production" for minimal logs

## Troubleshooting

### "OPENAI_API_KEY is required" Error

Make sure you've created the `.env` file and added your OpenAI API key.

### Module Not Found Errors

Run `npm install` to ensure all dependencies are installed.

### TypeScript Compilation Errors

Run `npm run build` to compile TypeScript to JavaScript.

### Output Directory Not Found

The system will automatically create the `outputs/` directory. If you see errors, check that you have write permissions.

## Next Steps

- Review `config.json` to customize analysis parameters
- Check the `outputs/` directory for generated analysis files
- Enable LangSmith tracing to debug and monitor execution
