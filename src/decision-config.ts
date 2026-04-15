import { MetricDefinition, DecisionConfig } from "./types.js";

export type DecisionType =
  | "acquisition_vs_organic"
  | "capital_budgeting"
  | "debt_vs_equity"
  | "market_entry"
  | "cost_reduction";

export const VALID_DECISION_TYPES: DecisionType[] = [
  "acquisition_vs_organic",
  "capital_budgeting",
  "debt_vs_equity",
  "market_entry",
  "cost_reduction",
];

export interface DecisionTypeConfig {
  label: string;
  description: string;
  hasAlternatives: boolean;
  alternativeLabels?: { a: string; b: string };
  metrics: MetricDefinition[];
  valueDriverHints: string[];
  assumptionVariableHints: string;
  sensitivityVariablePriorities: string[];
  strategySystemContext: string;
  riskSystemContext: string;
  modelingSystemContext: string;
  stressSystemContext: string;
  decisionSystemContext: string;
  completionSectionHeader: string;
}

const DECISION_TYPE_CONFIGS: Record<DecisionType, DecisionTypeConfig> = {

  acquisition_vs_organic: {
    label: "Acquisition vs Organic Growth",
    description: "Evaluate whether to acquire a target company or grow organically to achieve strategic goals.",
    hasAlternatives: true,
    alternativeLabels: { a: "Acquisition", b: "Organic Growth" },
    metrics: [
      { metricName: "ARR @ Month 24", description: "Annual Recurring Revenue at end of evaluation period", unit: "$M", decisionThreshold: "Target ARR" },
      { metricName: "Cumulative FCF", description: "Total free cash flow over evaluation period", unit: "$M", decisionThreshold: "Must stay within burn limit" },
      { metricName: "NPV", description: "Net Present Value of cash flows", unit: "$M", decisionThreshold: "> $0" },
      { metricName: "IRR", description: "Internal Rate of Return", unit: "%", decisionThreshold: "> WACC" },
      { metricName: "Payback Period", description: "Time to recover initial investment", unit: "months", decisionThreshold: "< 24 months" },
      { metricName: "Churn Rate @ Month 24", description: "Customer churn at end of evaluation period", unit: "%", decisionThreshold: "Below acceptable limit" },
      { metricName: "ROI", description: "Return on Investment as ratio", unit: "x", decisionThreshold: "> 1.0x" },
    ],
    valueDriverHints: [
      "Integration risk and synergy realization",
      "Customer retention post-acquisition",
      "Acquisition cost efficiency vs organic CAC",
      "Speed to market vs execution control",
      "Sales capacity scaling",
      "Product-led growth conversion",
      "Capital efficiency comparison",
    ],
    assumptionVariableHints: `**Option A (Acquisition Path):**
- Acquisition price (purchase price)
- Integration costs (one-time)
- Integration timeline (months)
- Customer retention risk (churn spike during integration)
- Synergy savings (monthly, post-integration)
- Cross-sell revenue lift (%)
- Integration distraction impact on organic growth (%)

**Option B (Organic Growth Path):**
- Sales capacity expansion (FTE/month)
- Product development costs (monthly)
- Marketing spend (monthly)
- Organic ARR growth rate (%)
- Product-led growth conversion lift (%)
- Churn reduction from product improvements (%)

**Common Variables (Both Paths):**
- Current ARR baseline
- ARR per customer
- Customer acquisition cost (CAC)
- Operating expenses
- Churn rate (base case)`,
    sensitivityVariablePriorities: [
      "Acquisition Price (Option A)",
      "Current ARR Baseline",
      "Integration Costs (Option A)",
      "Organic ARR Growth Rate (Option B)",
      "Churn Rate (Base Case)",
      "Customer Retention Risk (Option A)",
      "ARR per Customer",
      "Customer Acquisition Cost (CAC)",
    ],
    strategySystemContext: `If the business problem involves choosing between alternatives (e.g., "acquire vs organic growth"), value drivers MUST distinguish between the alternatives:
  * Include acquisition-specific drivers: integration risk, customer retention post-acquisition, synergy realization, acquisition cost efficiency
  * Include organic-specific drivers: sales capacity scaling, product-led growth conversion, organic churn reduction, organic growth rate
  * Include comparison drivers: speed to market, capital efficiency, execution risk`,
    riskSystemContext: "Focus on integration execution risk, customer churn post-acquisition, synergy realization timing, and organic growth execution risk.",
    modelingSystemContext: `Create separate metric tables for EACH alternative (Option A: Acquisition and Option B: Organic Growth). Model each path separately using appropriate assumptions. Cash flows for acquisition path should show large upfront cost at Month 0.`,
    stressSystemContext: "Test acquisition-specific variables (price, integration costs, retention risk) and organic-specific variables (growth rate, CAC, churn).",
    decisionSystemContext: `Compare alternatives using "Recommended Alternative" column. Explicitly state "Option A: [Acquisition Name]" or "Option B: Organic Growth". Primary Justification MUST compare both options with specific numbers.`,
    completionSectionHeader: "Strategic Path Selection",
  },

  capital_budgeting: {
    label: "Capital Budgeting Decision",
    description: "Evaluate whether to invest in a capital project based on financial viability and strategic fit.",
    hasAlternatives: false,
    metrics: [
      { metricName: "NPV", description: "Net Present Value of project cash flows", unit: "$M", decisionThreshold: "> $0" },
      { metricName: "IRR", description: "Internal Rate of Return", unit: "%", decisionThreshold: "> Hurdle Rate / WACC" },
      { metricName: "Payback Period", description: "Time to recover initial capital outlay", unit: "years", decisionThreshold: "Within acceptable horizon" },
      { metricName: "Profitability Index", description: "Ratio of PV of future cash flows to initial investment", unit: "x", decisionThreshold: "> 1.0x" },
      { metricName: "Cumulative FCF", description: "Total free cash flow over project life", unit: "$M", decisionThreshold: "Positive by end of horizon" },
      { metricName: "ROIC", description: "Return on Invested Capital", unit: "%", decisionThreshold: "> WACC" },
    ],
    valueDriverHints: [
      "Revenue generation capacity of the project",
      "Capital expenditure efficiency",
      "Operating cost structure",
      "Market demand / utilization rate",
      "Project execution risk",
      "Opportunity cost of capital",
    ],
    assumptionVariableHints: `**Capital Investment Variables:**
- Initial capital expenditure (CapEx)
- Working capital requirement
- Project useful life (years)
- Salvage / terminal value
- Discount rate / WACC

**Revenue & Operating Variables:**
- Annual revenue from project
- Revenue growth rate
- Operating costs (fixed)
- Operating costs (variable, per unit)
- Capacity utilization rate (%)

**Risk Variables:**
- Inflation rate
- Tax rate
- Depreciation method and schedule`,
    sensitivityVariablePriorities: [
      "Initial Capital Expenditure",
      "Annual Revenue",
      "Discount Rate / WACC",
      "Operating Costs",
      "Capacity Utilization Rate",
      "Revenue Growth Rate",
      "Project Useful Life",
      "Tax Rate",
    ],
    strategySystemContext: "Focus on project-level value drivers: revenue capacity, cost structure, capital efficiency, and utilization. Identify whether the project creates long-term competitive advantage.",
    riskSystemContext: "Challenge revenue projections, cost overrun risk, demand uncertainty, technology obsolescence, and regulatory risk. Widen ranges for variables with high uncertainty.",
    modelingSystemContext: "Calculate NPV, IRR, Payback Period, and Profitability Index using standard discounted cash flow methodology. Use project-specific discount rate. Show annual cash flows over the project life.",
    stressSystemContext: "Test CapEx overruns, revenue shortfalls, discount rate changes, and utilization drops. Identify the break-even utilization rate and break-even revenue level.",
    decisionSystemContext: `Use "Recommended Scenario" column. Recommend the Base scenario if NPV > 0 and IRR > hurdle rate. If Base fails, explain why and whether Upside assumptions are realistic.`,
    completionSectionHeader: "Capital Budgeting Analysis",
  },

  debt_vs_equity: {
    label: "Debt vs Equity Financing",
    description: "Determine the optimal financing mix between debt and equity for a capital raise or restructuring.",
    hasAlternatives: true,
    alternativeLabels: { a: "Debt Financing", b: "Equity Financing" },
    metrics: [
      { metricName: "Weighted Average Cost of Capital (WACC)", description: "Blended cost of capital after financing", unit: "%", decisionThreshold: "Minimize" },
      { metricName: "Interest Coverage Ratio", description: "EBIT / Interest Expense", unit: "x", decisionThreshold: "> 3.0x" },
      { metricName: "Debt-to-Equity Ratio", description: "Total Debt / Total Equity post-financing", unit: "x", decisionThreshold: "< Industry average" },
      { metricName: "EPS Impact", description: "Change in Earnings Per Share post-financing", unit: "$", decisionThreshold: "Maximize / non-dilutive" },
      { metricName: "Tax Shield Value", description: "PV of tax savings from debt interest deduction", unit: "$M", decisionThreshold: "Positive" },
      { metricName: "Financial Flexibility Score", description: "Qualitative rating of future financing capacity", unit: "1-10", decisionThreshold: "> 5" },
    ],
    valueDriverHints: [
      "Cost of debt vs cost of equity",
      "Tax shield benefit of debt",
      "Dilution impact on existing shareholders",
      "Financial flexibility and covenant constraints",
      "Credit rating impact",
      "Signaling effect to market",
    ],
    assumptionVariableHints: `**Debt Financing Variables (Option A):**
- Amount to raise via debt
- Interest rate (fixed/variable)
- Loan term / maturity (years)
- Debt issuance costs
- Covenant restrictions (debt/EBITDA ratio)
- Amortization schedule

**Equity Financing Variables (Option B):**
- Amount to raise via equity
- Share price at issuance
- Number of new shares issued
- Equity issuance costs (underwriting fees)
- Dilution percentage
- Expected equity cost of capital

**Common Variables:**
- Current EBIT / EBITDA
- Current shares outstanding
- Current debt level
- Corporate tax rate
- Risk-free rate
- Company beta`,
    sensitivityVariablePriorities: [
      "Interest Rate",
      "Share Price at Issuance",
      "Corporate Tax Rate",
      "EBIT / EBITDA",
      "Debt Amount",
      "Dilution Percentage",
      "Company Beta",
      "Debt Maturity",
    ],
    strategySystemContext: "Focus on capital structure optimization. Value drivers should distinguish between the cost advantages of debt (tax shield, lower cost) and the flexibility advantages of equity (no covenants, no mandatory repayment).",
    riskSystemContext: "Challenge interest rate assumptions, assess credit risk, evaluate covenant breach probability, and model equity market conditions. Consider refinancing risk for debt.",
    modelingSystemContext: "Calculate WACC under both financing structures. Model EPS impact, coverage ratios, and debt capacity. Create separate metric tables for Option A (Debt) and Option B (Equity).",
    stressSystemContext: "Test interest rate changes, EBIT decline scenarios, and share price sensitivity. Identify the EBIT level at which debt covenants are breached.",
    decisionSystemContext: `Compare "Option A: Debt Financing" and "Option B: Equity Financing" using Recommended Alternative column. Consider both quantitative (WACC, EPS) and qualitative (flexibility, signal) factors.`,
    completionSectionHeader: "Financing Structure Analysis",
  },

  market_entry: {
    label: "Market Entry Investment",
    description: "Evaluate whether to enter a new market and determine the optimal entry strategy.",
    hasAlternatives: false,
    metrics: [
      { metricName: "NPV", description: "Net Present Value of market entry investment", unit: "$M", decisionThreshold: "> $0" },
      { metricName: "Market Share @ Year 3", description: "Expected market share after 3 years", unit: "%", decisionThreshold: "Viable competitive position" },
      { metricName: "Break-even Timeline", description: "Time to reach operational break-even", unit: "months", decisionThreshold: "Within acceptable horizon" },
      { metricName: "Total Investment Required", description: "Cumulative capital needed until break-even", unit: "$M", decisionThreshold: "Within budget" },
      { metricName: "Revenue @ Year 3", description: "Annual revenue at year 3", unit: "$M", decisionThreshold: "Above minimum viable scale" },
      { metricName: "ROI", description: "Return on total market entry investment", unit: "x", decisionThreshold: "> 1.5x" },
    ],
    valueDriverHints: [
      "Market size and growth rate (TAM/SAM/SOM)",
      "Competitive intensity and barriers to entry",
      "Customer acquisition cost in new market",
      "Regulatory and compliance costs",
      "Brand transferability / localization cost",
      "Channel development requirements",
    ],
    assumptionVariableHints: `**Market Variables:**
- Total Addressable Market (TAM)
- Market growth rate (% annual)
- Target market share by Year 1, 2, 3
- Average revenue per customer
- Customer acquisition cost (CAC) in new market
- Customer lifetime value (LTV)

**Investment Variables:**
- Initial market entry investment
- Localization / adaptation costs
- Marketing launch budget
- Sales team hiring costs
- Regulatory compliance costs
- Working capital requirement

**Operating Variables:**
- Monthly operating costs
- Revenue ramp timeline
- Churn rate in new market
- Gross margin (may differ from home market)
- Pricing strategy (premium / competitive / penetration)`,
    sensitivityVariablePriorities: [
      "Total Addressable Market (TAM)",
      "Market Share Target",
      "Customer Acquisition Cost (CAC)",
      "Initial Market Entry Investment",
      "Revenue per Customer",
      "Market Growth Rate",
      "Monthly Operating Costs",
      "Churn Rate in New Market",
    ],
    strategySystemContext: "Focus on market attractiveness and competitive positioning. Value drivers should address market size, competitive dynamics, customer acquisition, and localization requirements.",
    riskSystemContext: "Challenge market size estimates, assess competitive response risk, evaluate regulatory hurdles, and model slower-than-expected customer adoption curves.",
    modelingSystemContext: "Calculate NPV over 3-5 year horizon. Model market penetration curve. Show monthly/quarterly cash flows with break-even point clearly identified.",
    stressSystemContext: "Test TAM reduction, slower market share growth, higher CAC, and competitive price pressure. Identify minimum viable market share for positive NPV.",
    decisionSystemContext: `Use "Recommended Scenario" column. Assess whether the market entry meets return thresholds and strategic fit. Consider go/no-go decision and phased entry as conditions.`,
    completionSectionHeader: "Market Entry Analysis",
  },

  cost_reduction: {
    label: "Cost Reduction Initiative",
    description: "Evaluate a cost reduction or operational efficiency initiative for financial and operational impact.",
    hasAlternatives: false,
    metrics: [
      { metricName: "NPV of Net Savings", description: "Present value of savings minus implementation cost", unit: "$M", decisionThreshold: "> $0" },
      { metricName: "Payback Period", description: "Time to recover implementation cost from savings", unit: "months", decisionThreshold: "< 18 months" },
      { metricName: "Annual Savings", description: "Recurring annual cost reduction", unit: "$M/year", decisionThreshold: "Above minimum target" },
      { metricName: "Implementation Cost", description: "Total one-time cost to execute the initiative", unit: "$M", decisionThreshold: "Within budget" },
      { metricName: "ROI", description: "Return on implementation investment", unit: "x", decisionThreshold: "> 2.0x" },
      { metricName: "Disruption Risk Score", description: "Qualitative assessment of operational disruption", unit: "1-10", decisionThreshold: "< 6" },
    ],
    valueDriverHints: [
      "Process efficiency gains",
      "Headcount optimization",
      "Technology automation potential",
      "Vendor consolidation savings",
      "Quality impact (positive or negative)",
      "Employee morale and retention risk",
    ],
    assumptionVariableHints: `**Savings Variables:**
- Annual labor cost savings
- Annual technology/automation savings
- Annual vendor consolidation savings
- Annual process efficiency savings
- Savings ramp timeline (months to full run-rate)

**Implementation Variables:**
- Technology / tool implementation cost
- Consulting / advisory fees
- Employee severance costs
- Training and change management costs
- Implementation timeline (months)

**Risk Variables:**
- Productivity dip during transition (%)
- Employee attrition risk (%)
- Quality impact (defect rate change)
- Customer satisfaction impact
- Savings realization rate (% of projected)`,
    sensitivityVariablePriorities: [
      "Annual Labor Cost Savings",
      "Implementation Cost",
      "Savings Realization Rate",
      "Productivity Dip During Transition",
      "Savings Ramp Timeline",
      "Employee Attrition Risk",
      "Technology Automation Savings",
      "Vendor Consolidation Savings",
    ],
    strategySystemContext: "Focus on operational efficiency drivers. Value drivers should address savings sources, implementation complexity, organizational readiness, and sustainability of savings.",
    riskSystemContext: "Challenge savings estimates (often overstated), assess implementation risk, evaluate productivity dip during transition, and model partial savings realization scenarios.",
    modelingSystemContext: "Calculate NPV of net savings over 3-5 year horizon. Show monthly savings ramp-up. Compute payback period from cumulative net savings. Cash flows should show negative (implementation costs) then positive (net savings).",
    stressSystemContext: "Test savings shortfall (only 50-70% realized), cost overruns on implementation, longer ramp timeline, and productivity loss during transition.",
    decisionSystemContext: `Use "Recommended Scenario" column. Recommend if Base NPV > 0 and payback < target. Include implementation conditions and phasing recommendations.`,
    completionSectionHeader: "Cost Reduction Analysis",
  },
};

export function getDecisionTypeConfig(decisionType: string): DecisionTypeConfig {
  const dt = decisionType as DecisionType;
  if (!DECISION_TYPE_CONFIGS[dt]) {
    throw new Error(
      `Unknown decision_type: "${decisionType}". Valid types: ${VALID_DECISION_TYPES.join(", ")}`
    );
  }
  return DECISION_TYPE_CONFIGS[dt];
}

/**
 * Strict validation — decision_type must be explicitly provided.
 * No inference, no guessing, no keyword scanning.
 */
export function validateDecisionType(decisionType: string | undefined): DecisionType {
  if (!decisionType) {
    throw new Error(
      `Invalid or missing decision_type. Must be one of: ${VALID_DECISION_TYPES.join(", ")}`
    );
  }
  if (!VALID_DECISION_TYPES.includes(decisionType as DecisionType)) {
    throw new Error(
      `Invalid or missing decision_type: "${decisionType}". Must be one of: ${VALID_DECISION_TYPES.join(", ")}`
    );
  }
  return decisionType as DecisionType;
}

export const DECISION_CONFIGS: Record<string, DecisionConfig> = {

  capital_budgeting: {
    optionType: "binary",
    cashFlowHorizon: 60,
    metrics: [
      { name: "NPV", unit: "$ millions", threshold: "Must be > 0", description: "Net present value of project cash flows" },
      { name: "IRR", unit: "%", threshold: "Must exceed hurdle rate (typically 15%)", description: "Internal rate of return" },
      { name: "Payback Period", unit: "years", threshold: "Must be ≤ 3 years", description: "Time to recover initial investment" },
      { name: "ROI", unit: "ratio (e.g. 1.8x)", threshold: "Must be > 1.0x", description: "Return on invested capital" },
      { name: "EBITDA Impact", unit: "$ millions/year", threshold: "Must be positive by Year 2", description: "Incremental EBITDA from project" },
    ],
  },

  acquisition_vs_organic: {
    optionType: "multi",
    cashFlowHorizon: 24,
    metrics: [
      { name: "ARR @ Month 24", unit: "$ millions", threshold: "Must reach stated ARR target", description: "Annual recurring revenue at end of horizon" },
      { name: "Cumulative FCF", unit: "$ millions", threshold: "Must not exceed stated burn limit", description: "Total free cash flow over horizon" },
      { name: "Cumulative Cash Burn", unit: "$ millions", threshold: "Must stay within downside limit", description: "Peak negative cash position" },
      { name: "NRR", unit: "%", threshold: "Must be ≥ 100%", description: "Net revenue retention" },
      { name: "Churn Rate @ Month 24", unit: "% annualized", threshold: "Must not exceed stated churn limit", description: "Logo churn at end of horizon" },
      { name: "Peak Burn", unit: "$ millions", threshold: "Must stay within downside burn limit", description: "Worst single-month cash outflow" },
      { name: "CAC Payback", unit: "months", threshold: "Must be ≤ 18 months", description: "Months to recover customer acquisition cost" },
    ],
  },

  debt_vs_equity: {
    optionType: "multi",
    cashFlowHorizon: 36,
    metrics: [
      { name: "WACC", unit: "%", threshold: "Must be minimized vs current WACC", description: "Weighted average cost of capital post-raise" },
      { name: "EPS Dilution", unit: "%", threshold: "Must be < stated dilution limit", description: "Earnings per share dilution from equity issuance" },
      { name: "Debt-to-Equity Ratio", unit: "ratio", threshold: "Must maintain investment-grade level", description: "Post-raise leverage ratio" },
      { name: "Interest Coverage Ratio", unit: "ratio", threshold: "Must be > 2.5x", description: "EBIT divided by annual interest expense" },
      { name: "Cost of Capital", unit: "%", threshold: "Must be lower than current", description: "Blended cost of new financing instrument" },
    ],
  },

  market_entry: {
    optionType: "binary",
    cashFlowHorizon: 36,
    metrics: [
      { name: "Market Share @ Month 36", unit: "%", threshold: "Must reach stated market share target", description: "Penetration of TAM at end of horizon" },
      { name: "Break-even Month", unit: "month number", threshold: "Must be ≤ stated break-even target", description: "Month cumulative FCF crosses zero" },
      { name: "Cumulative FCF", unit: "$ millions", threshold: "Must be positive by end of horizon", description: "Total free cash flow over horizon" },
      { name: "NPV", unit: "$ millions", threshold: "Must be > 0", description: "Net present value of market entry cash flows" },
      { name: "IRR", unit: "%", threshold: "Must exceed hurdle rate", description: "Internal rate of return on entry investment" },
      { name: "ROI", unit: "ratio (e.g. 1.4x)", threshold: "Must be > 1.0x", description: "Return on initial investment" },
    ],
  },

  cost_reduction: {
    optionType: "binary",
    cashFlowHorizon: 24,
    metrics: [
      { name: "Payback Period", unit: "months", threshold: "Must be ≤ stated payback target", description: "Months to recover implementation cost" },
      { name: "Annual Net Savings", unit: "$ millions/year", threshold: "Must meet or exceed stated savings target", description: "Gross savings minus ongoing costs" },
      { name: "Cumulative FCF @ Month 24", unit: "$ millions", threshold: "Must be positive", description: "Total net savings minus investment cost" },
      { name: "Implementation ROI", unit: "ratio (e.g. 2.1x)", threshold: "Must be > 1.0x", description: "Net savings divided by implementation cost" },
      { name: "Operational Disruption Score", unit: "1-10 scale", threshold: "Must be < 6", description: "Estimated disruption to operations during rollout" },
    ],
  },
};
