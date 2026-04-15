#!/bin/bash
# Test script for the Corporate Finance Analysis System
# decision_type is MANDATORY — no defaults, no inference.
#
# Usage (decision_type is REQUIRED):
#   ./test-case-study.sh acquisition_vs_organic
#   ./test-case-study.sh capital_budgeting
#   ./test-case-study.sh debt_vs_equity
#   ./test-case-study.sh market_entry
#   ./test-case-study.sh cost_reduction

set -e

if [ -z "$1" ]; then
  echo "ERROR: decision_type argument is required."
  echo "Usage: ./test-case-study.sh <decision_type>"
  echo "Valid types: acquisition_vs_organic, capital_budgeting, debt_vs_equity, market_entry, cost_reduction"
  exit 1
fi

DECISION_TYPE="$1"

echo "============================================="
echo "Corporate Finance Analysis System - Test Run"
echo "Decision Type: $DECISION_TYPE"
echo "============================================="

# Build
echo "Building project..."
npm run build

echo ""
echo "Running analysis for decision type: $DECISION_TYPE"
echo "============================================="

case "$DECISION_TYPE" in
  acquisition_vs_organic)
    node dist/index.js \
      "FlowOps must choose between acquiring TaskPilot or pursuing organic growth to reach \$50M ARR within 24 months while keeping burn controllable and maintaining product quality." \
      "Reach \$50M ARR within 24 months while keeping burn controllable and maintaining product quality" \
      "acquisition_vs_organic"
    ;;

  capital_budgeting)
    node dist/index.js \
      "TechCorp is evaluating a \$15M investment in a new automated manufacturing line that would increase production capacity by 40% and reduce per-unit costs by 25% over a 5-year horizon." \
      "Achieve positive NPV with IRR above 15% hurdle rate and payback within 3 years" \
      "capital_budgeting"
    ;;

  debt_vs_equity)
    node dist/index.js \
      "GlobalTech needs to raise \$50M to fund its expansion. The company must decide between issuing corporate bonds at 6.5% or a secondary equity offering at current share price of \$45, considering its existing debt-to-equity ratio of 0.8x." \
      "Minimize WACC while maintaining investment-grade credit rating and limiting EPS dilution below 10%" \
      "debt_vs_equity"
    ;;

  market_entry)
    node dist/index.js \
      "CloudServe is evaluating entry into the Southeast Asian market with an estimated TAM of \$2B and 12% annual growth. Initial investment would be \$8M including localization, regulatory compliance, and local sales team." \
      "Achieve 2% market share within 3 years with positive ROI and break-even within 24 months" \
      "market_entry"
    ;;

  cost_reduction)
    node dist/index.js \
      "DataFlow is considering a company-wide automation initiative replacing manual data processing workflows. The project requires \$4M upfront investment in AI/ML tools and process redesign, expected to reduce operational costs by \$2.5M annually." \
      "Achieve payback within 18 months with sustained annual savings of at least \$2M and minimal disruption to operations" \
      "cost_reduction"
    ;;

  *)
    echo "ERROR: Unknown decision type: $DECISION_TYPE"
    echo "Valid types: acquisition_vs_organic, capital_budgeting, debt_vs_equity, market_entry, cost_reduction"
    exit 1
    ;;
esac

echo ""
echo "============================================="
echo "Test complete. Check outputs/ directory."
echo "============================================="
