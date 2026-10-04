// The compiler's feature glossary (api/crew/features.py), for the What-if panel's signal picker.
// api/tests/test_web_contract.py fails if the two drift apart.

export const FEATURES: Record<string, string> = {
  fwd_fcf_fair_value: "forward free-cash-flow fair value relative to price",
  fundamental_surprise: "how far reported fundamentals beat or missed expectations",
  kl_surprise_bits: "information surprise of the latest earnings print, in bits",
  measured_half_life: "how slowly an earnings surprise decays (longer = more persistent)",
  growth_kalman_update: "latest revision to the estimated growth trend",
  fundamental_confidence: "how reliable the fundamental data is",
  log_fv_gap: "log gap between price and fair value (negative = cheap)",
  guidance_range_velocity: "how fast company guidance ranges are moving",
  composite_valuation_gap: "combined valuation gap vs peers (negative = cheap)",
  valuation_kurtosis: "how fat-tailed the valuation estimates are",
  cornish_fisher_gap: "tail-adjusted valuation gap",
  mean_reversion_speed: "how fast mispricing closes, per month",
  minute_realized_diffusion: "intraday realized volatility from minute bars",
  amihud_illiq: "price impact per dollar traded (high = illiquid)",
  kyle_lambda: "informed-trading price impact (low = deep, uninformed flow)",
  fdt_deviation: "deviation from fluctuation-dissipation balance in trading",
  liquidity_roc: "rate of change of liquidity (liquidity momentum)",
  atm_iv: "at-the-money implied volatility",
  variance_risk_premium: "implied minus realized variance",
  skew_25d: "25-delta options skew (rising = demand for protection or informed flow)",
  rn_kurtosis: "risk-neutral tail fatness from the options smile",
  oi_divergence: "options open interest building against contract volume",
  term_slope: "slope of implied volatility across expiries",
  treasury_funding_interact: "treasury yields interacting with funding conditions",
  inflation_expectation: "market inflation expectations",
  funding_stress: "stress in short-term funding markets",
  mktcap_duration_interact: "company size interacting with rate duration",
};

// One value per date for every ticker: a ranking on them alone ties every stock.
export const MARKET_WIDE: readonly string[] = ["treasury_funding_interact", "inflation_expectation", "funding_stress"];
