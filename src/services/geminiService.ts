// Compatibility facade for legacy components.
// The application now uses gapgptService as the unified analysis/data service.
export {
  analyzeStock,
  getPortfolioOptimization,
  compareStocks,
  runAutomatedScalpingAnalysis,
  runAutomatedScalping,
  getScalpingOpportunities,
  getMarketSummary,
  getMostTradedStocks,
  getTopIndustryGroups,
  getRealMoneyInflow,
  getRealMoneyOutflow,
  getMarketIndexData,
  getFinalMarketIndexData,
  updateMarketIndex,
  testAnalyzeStock,
} from './gapgptService';
