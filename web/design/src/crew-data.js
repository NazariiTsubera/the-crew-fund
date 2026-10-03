(function () {
  const M = []; for (let i = 0; i < 116; i++) M.push(`${2017 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`);
  const LAST = M.length - 1;
  const mi = s => M.indexOf(s);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const ml = m => MON[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4);
  const pct = (x, d = 1) => (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(d) + '%';
  const num = (x, d = 2) => (x < 0 ? '−' : '') + Math.abs(x).toFixed(d);
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const gauss = r => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
  const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

  function series(seed, vol, shocks, target, stopAt) {
    const r = rng(seed), last = stopAt ? mi(stopAt) : LAST;
    const base = M.map((m, i) => i === 0 ? 0 : vol * gauss(r) + (shocks[m] || 0));
    const prod = c => { let p = 1; for (let i = 1; i <= last; i++) p *= 1 + base[i] + c; return p; };
    let lo = -0.05, hi = 0.05; for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; prod(mid) < target ? lo = mid : hi = mid; }
    const c = (lo + hi) / 2, v = [1];
    for (let i = 1; i < M.length; i++) v.push(i <= last ? v[i - 1] * (1 + base[i] + c) : v[i - 1]);
    return v;
  }
  function stats(rets) { const mean = rets.reduce((a, b) => a + b, 0) / rets.length; const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length - 1)); return { mean, sd }; }
  function kpis(v, lastIdx) {
    const last = lastIdx ?? v.length - 1, rets = [];
    for (let i = 1; i <= last; i++) rets.push(v[i] / v[i - 1] - 1);
    const { sd } = stats(rets);
    const total = v[last] / v[0] - 1, ann = Math.pow(1 + total, 12 / Math.max(1, last)) - 1, vol = sd * Math.sqrt(12);
    let peak = v[0], dd = 0, ddI = 0;
    for (let i = 0; i <= last; i++) { peak = Math.max(peak, v[i]); const d = v[i] / peak - 1; if (d < dd) { dd = d; ddI = i; } }
    return { total_return: total, ann_return: ann, ann_vol: vol, sharpe: vol ? ann / vol : 0, max_drawdown: dd, ddI, max_drawdown_month: M[ddI] };
  }
  function trailingAt(v, i, w = 12) { i = Math.max(i, w); const r = []; for (let k = i - w + 1; k <= i; k++) r.push(v[k] / v[k - 1] - 1); const { mean, sd } = stats(r); return sd ? mean * 12 / (sd * Math.sqrt(12)) : 0; }
  function ddWindow(v, a, b) { let peak = v[a], dd = 0; for (let i = a; i <= b; i++) { peak = Math.max(peak, v[i]); dd = Math.min(dd, v[i] / peak - 1); } return dd; }
  function yearly(v, stopIdx) {
    const out = {}, end = stopIdx ?? LAST;
    for (let y = 2017; y <= 2026; y++) { const s = y === 2017 ? 0 : mi(`${y - 1}-12`), e = Math.min(y === 2026 ? LAST : mi(`${y}-12`), end); if (s < e) out[y] = v[e] / v[s] - 1; }
    return out;
  }

  const spx = series(7, 0.032, { '2018-10': -0.07, '2018-12': -0.08, '2020-02': -0.08, '2020-03': -0.12, '2020-04': 0.11, '2022-01': -0.05, '2022-04': -0.08, '2022-06': -0.08, '2022-09': -0.08, '2022-10': 0.06 }, 1.46);
  const fund = series(3, 0.005, { '2020-02': -0.07, '2020-03': -0.11, '2020-04': 0.04, '2022-04': -0.02, '2022-06': -0.02, '2022-09': -0.02 }, 1.70);

  const FEATURES = ['fwd_fcf_fair_value', 'fundamental_surprise', 'kl_surprise_bits', 'measured_half_life', 'growth_kalman_update', 'fundamental_confidence', 'log_fv_gap', 'guidance_range_velocity', 'composite_valuation_gap', 'valuation_kurtosis', 'cornish_fisher_gap', 'mean_reversion_speed', 'minute_realized_diffusion', 'amihud_illiq', 'kyle_lambda', 'fdt_deviation', 'liquidity_roc', 'atm_iv', 'variance_risk_premium', 'skew_25d', 'rn_kurtosis', 'oi_divergence', 'term_slope', 'treasury_funding_interact', 'inflation_expectation', 'funding_stress', 'mktcap_duration_interact'];
  const TICKERS = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'AVGO', 'LLY', 'JPM', 'V', 'UNH', 'XOM', 'MA', 'COST', 'HD', 'PG', 'JNJ', 'ABBV', 'CRM', 'ORCL', 'KO', 'PEP', 'MRK', 'BAC', 'WMT', 'ADBE', 'AMD', 'NFLX', 'TMO', 'CVX', 'LIN', 'MCD', 'CSCO', 'ACN', 'ABT', 'INTU', 'TXN', 'QCOM', 'CAT', 'BRK.B'];

  function featVal(name, r) {
    if (name === 'measured_half_life') return `half-life ${Math.round(18 + r() * 40)}d`;
    if (name === 'kl_surprise_bits') return `kl_surprise_bits ${(1.2 + r() * 1.8).toFixed(1)}`;
    if (['funding_stress', 'oi_divergence', 'fundamental_surprise', 'skew_25d', 'liquidity_roc', 'guidance_range_velocity'].includes(name)) return `${name} z=${num(r() * 2.6 - 0.4, 1)}`;
    if (name === 'inflation_expectation') return `inflation_expectation ${(2 + r() * 1.5).toFixed(1)}%`;
    if (name === 'atm_iv') return `atm_iv ${Math.round(18 + r() * 20)}%`;
    if (name === 'mean_reversion_speed') return `mean_reversion_speed ${(0.05 + r() * 0.1).toFixed(2)}/mo`;
    if (name === 'fundamental_confidence') return `fundamental_confidence ${(0.55 + r() * 0.4).toFixed(2)}`;
    return `${name} ${num(r() * 0.6 - 0.3)}`;
  }

  const FILLS = {
    solid: { css: '#efefef', svg: '#efefef' },
    mid: { css: '#a3a3a3', svg: '#a3a3a3' },
    hatch: { css: 'repeating-linear-gradient(45deg,#dcdcdc 0 2px,#0a0a0a 2px 5px)', svg: 'url(#p-hatch)' },
    dark: { css: '#5c5c5c', svg: '#5c5c5c' },
    dark2: { css: '#333333', svg: '#333333' },
    vlines: { css: 'repeating-linear-gradient(90deg,#c8c8c8 0 1px,#0a0a0a 1px 4px)', svg: 'url(#p-vlines)' },
    dots: { css: 'radial-gradient(#d4d4d4 1.1px, #0a0a0a 1.3px) 0 0/4px 4px', svg: 'url(#p-dots)' },
  };
  function glyph(shape, size = 12, dim = false, color = 'var(--ink)') {
    const tone = dim ? 'var(--faint)' : color;
    const s = { display: 'inline-block', width: size + 'px', height: size + 'px', flex: 'none', background: tone };
    if (shape === 'circle') s.borderRadius = '50%';
    if (shape === 'diamond') s.transform = 'rotate(45deg) scale(0.76)';
    if (shape === 'ring') { s.background = 'transparent'; s.border = `${Math.max(2, Math.round(size / 5))}px solid ${tone}`; s.borderRadius = '50%'; }
    if (shape === 'triangle') s.clipPath = 'polygon(50% 4%, 100% 96%, 0 96%)';
    if (shape === 'box') { s.background = 'transparent'; s.border = `${Math.max(2, Math.round(size / 5))}px solid ${tone}`; }
    if (shape === 'half') { s.background = `linear-gradient(90deg, ${tone} 50%, transparent 50%)`; s.border = `1.5px solid ${tone}`; s.borderRadius = '50%'; }
    if (shape === 'plus') s.clipPath = 'polygon(35% 0,65% 0,65% 35%,100% 35%,100% 65%,65% 65%,65% 100%,35% 100%,35% 65%,0 65%,0 35%,35% 35%)';
    return s;
  }

  function redTeam(curve, seed, last, robust) {
    const r = rng(seed * 7 + 5), k = kpis(curve, last);
    const lag = k.sharpe * (robust ? 0.88 + r() * 0.09 : 0.7 + r() * 0.27);
    const p = robust || r() < 0.85 ? 0.002 + r() * 0.02 : 0.06 + r() * 0.1;
    const a20 = ddWindow(curve, mi('2020-01'), mi('2020-06')), s20 = ddWindow(spx, mi('2020-01'), mi('2020-06'));
    const a22 = ddWindow(curve, mi('2021-12'), mi('2022-12')), s22 = ddWindow(spx, mi('2021-12'), mi('2022-12'));
    const tests = [
      { name: 'Lookahead test', passed: lag / k.sharpe > 0.8, detail: `Sharpe ${num(k.sharpe)} → ${num(lag)} with signals lagged one month` },
      { name: 'Shuffle test', passed: p < 0.05, detail: `Shuffled-label Sharpe ${num(r() * 0.1 - 0.03)} over 500 runs, p=${p.toFixed(3)}` },
      { name: '2020 replay', passed: a20 >= s20, detail: `Drawdown ${pct(a20, 0)} vs SPX ${pct(s20, 0)}, Feb–Apr 2020` },
      { name: '2022 replay', passed: a22 >= s22, detail: `Drawdown ${pct(a22, 0)} vs SPX ${pct(s22, 0)} in the 2022 bear market` },
    ];
    const fails = tests.filter(t => !t.passed).length;
    return { tests, verdict: fails === 0 ? 'pass' : fails === 1 ? 'probation' : 'killed', a20, s20, a22, s22 };
  }

  const allocMonths = M.slice(mi('2024-09'));
  const keys = [['2024-09', [.26, .26, .28, .10, .10]], ['2025-01', [.28, .27, .27, .12, .06]], ['2025-03', [.31, .28, .27, .14, 0]], ['2025-09', [.34, .30, .22, .14, 0]], ['2026-03', [.36, .31, .18, .15, 0]], ['2026-08', [.38, .31, .15, .16, 0]]];
  const alloc = allocMonths.map(m => {
    const i = mi(m); let k = 0; while (k < keys.length - 2 && mi(keys[k + 1][0]) <= i) k++;
    const [m0, a0] = keys[k], [m1, a1] = keys[k + 1], t = Math.min(1, Math.max(0, (i - mi(m0)) / (mi(m1) - mi(m0))));
    return a0.map((x, j) => x + (a1[j] - x) * t);
  });
  const memos = [
    ['2024-11', 'Cut The Wheelman 10% → 8% · liquidity_roc signal decayed', 'mastermind'],
    ['2025-01', 'Red Team: The Wheelman fails 2022 replay, probation', 'redteam'],
    ['2025-03', 'Fired The Wheelman · trailing Sharpe −0.4 for 3 months, capital → 0%', 'fire'],
    ['2025-09', 'Raised The Accountant to 34% · trailing Sharpe 1.6', 'mastermind'],
    ['2026-02', 'Red Team: The Inside Man on probation after 2022 replay', 'redteam'],
    ['2026-06', 'Cut The Inside Man 17% → 16% · skew_25d hit rate 0.48', 'mastermind'],
    ['2026-08', 'Capital cut: The Inside Man → 15% · Accountant → 38%', 'mastermind'],
  ];
  const holdings = [
    ['NVDA', .112, 'insideman', 'skew_25d rising 3 months, oi_divergence +1.8σ'],
    ['MSFT', .094, 'accountant', 'kl_surprise_bits 2.6 on FY26 Q4 print'],
    ['CRM', .081, 'accountant', 'fundamental_surprise +1.9σ, half-life 34d'],
    ['GOOGL', .078, 'fence', 'log_fv_gap −0.21, mean_reversion_speed 0.11/mo'],
    ['JPM', .072, 'fence', 'composite_valuation_gap −0.17 vs sector'],
    ['UNH', .066, 'fence', 'fwd_fcf_fair_value 18% above price'],
    ['AVGO', .063, 'insideman', 'variance_risk_premium compressing, term_slope +0.04'],
    ['COST', .058, 'accountant', 'guidance_range_velocity narrowing 2 quarters'],
    ['XOM', .054, 'lookout', 'inflation_expectation 2.7%, funding_stress z=−0.4'],
    ['LLY', .052, 'accountant', 'growth_kalman_update +0.8, fundamental_confidence 0.81'],
    ['V', .049, 'fence', 'cornish_fisher_gap −0.12, valuation_kurtosis low'],
    ['AMZN', .047, 'insideman', 'rn_kurtosis falling, atm_iv below 6m median'],
    ['PG', .041, 'lookout', 'treasury_funding_interact −1.2, defensive tilt'],
    ['HD', .038, 'fence', 'mean_reversion_speed 0.09/mo, log_fv_gap −0.14'],
    ['BRK.B', .035, 'lookout', 'mktcap_duration_interact −0.6, low duration'],
    ['META', .033, 'insideman', 'kyle_lambda falling, informed flow building'],
    ['KO', .027, 'lookout', 'funding_stress z=1.1 → defensive sleeve'],
  ].sort((a, b) => b[1] - a[1]);

  const SEEDS = [
    { id: 'accountant', name: 'The Accountant', shape: 'circle', fill: 'solid', color: 'var(--c-violet)', persona: 'Dry, exact, former auditor. Talks in basis points and never rounds up.', strategy: 'Buys stocks after earnings that surprise the model, not the consensus.', pitch: 'I buy companies right after earnings that surprise my model, not the consensus, and hold them while the surprise decays', seed: 11, vol: 0.03, target: 2.05, shocks: { '2020-03': -0.09, '2022-06': -0.05 }, status: 'trading', turnover: 0.38, robust: true,
      recipe: { features: [{ name: 'kl_surprise_bits', weight: 0.4, direction: 'high' }, { name: 'fundamental_surprise', weight: 0.3, direction: 'high' }, { name: 'measured_half_life', weight: 0.15, direction: 'high' }, { name: 'growth_kalman_update', weight: 0.15, direction: 'high' }], filters: ['mktcap > $10B', 'amihud_illiq < p80'], lookback_months: 12, top_n: 12, rebalance: 'monthly', sit_out_if_trailing_sharpe_below: 0.0 },
      notes: [{ m: '2020-03', d: '16', type: 'risk', text: 'Held through: fundamental_confidence 0.74 above 0.6 floor, book down −9%' }, { m: '2024-01', type: 'redteam', text: 'Red Team: all 4 tests passed, verdict PASS' }, { m: '2025-09', type: 'mastermind', text: 'Mastermind: capital raised to 34% · trailing Sharpe 1.6' }, { m: '2026-06', type: 'mastermind', text: 'Mastermind: capital raised to 37%' }, { m: '2026-08', type: 'mastermind', text: 'Mastermind: capital raised to 38%' }] },
    { id: 'fence', name: 'The Fence', shape: 'square', fill: 'mid', color: 'var(--c-teal)', persona: 'Patient, a little smug. Thinks every price is a negotiation.', strategy: 'Buys quality names trading below fair value; sells when the gap closes.', pitch: 'I buy quality names trading below fair value and sell them once the gap closes', seed: 23, vol: 0.028, target: 1.62, shocks: { '2020-03': -0.1, '2022-09': -0.04 }, status: 'trading', turnover: 0.21, robust: true,
      recipe: { features: [{ name: 'log_fv_gap', weight: 0.35, direction: 'low' }, { name: 'composite_valuation_gap', weight: 0.3, direction: 'low' }, { name: 'mean_reversion_speed', weight: 0.2, direction: 'high' }, { name: 'fwd_fcf_fair_value', weight: 0.15, direction: 'high' }], filters: ['fundamental_confidence > 0.6', 'mktcap > $20B'], lookback_months: 24, top_n: 10, rebalance: 'monthly', sit_out_if_trailing_sharpe_below: -0.2 },
      notes: [{ m: '2022-10', d: '14', type: 'trade', text: 'Bought JPM 3.8% — composite_valuation_gap −0.24, mean_reversion_speed 0.12/mo' }, { m: '2024-01', type: 'redteam', text: 'Red Team: all 4 tests passed, verdict PASS' }, { m: '2026-03', type: 'mastermind', text: 'Mastermind: capital held at 31%' }] },
    { id: 'insideman', name: 'The Inside Man', shape: 'diamond', fill: 'hatch', color: 'var(--c-rose)', persona: 'Jittery, talks fast, always watching the options pit. Defensive about 2022.', strategy: 'Follows options-market tells: rising skew and building informed flow.', pitch: 'I follow the options market: rising skew and building informed flow tell me where someone knows something', seed: 41, vol: 0.034, target: 1.38, shocks: { '2020-03': -0.08, '2022-02': -0.12, '2022-05': -0.13, '2022-09': -0.12, '2026-04': -0.03, '2026-06': -0.025 }, status: 'trading', verdict: 'probation', forceFail: ['2022 replay'], turnover: 0.62, robust: true,
      recipe: { features: [{ name: 'skew_25d', weight: 0.35, direction: 'high' }, { name: 'oi_divergence', weight: 0.25, direction: 'high' }, { name: 'variance_risk_premium', weight: 0.2, direction: 'low' }, { name: 'kyle_lambda', weight: 0.2, direction: 'low' }], filters: ['amihud_illiq < p70', 'atm_iv < p90'], lookback_months: 6, top_n: 8, rebalance: 'monthly', sit_out_if_trailing_sharpe_below: 0.0 },
      notes: a => [{ m: '2022-06', d: '01', type: 'risk', text: 'skew_25d hit rate fell to 0.44 over 9 months' }, { m: '2026-02', d: '20', type: 'redteam', text: `Red Team: 2022 replay drawdown ${pct(a.rt.a22, 0)} vs SPX ${pct(a.rt.s22, 0)}, probation` }, { m: '2026-06', type: 'mastermind', text: 'Mastermind: capital cut to 16%' }, { m: '2026-08', type: 'mastermind', text: 'Mastermind: capital cut to 15%' }] },
    { id: 'lookout', name: 'The Lookout', shape: 'ring', fill: 'dark', color: 'var(--c-green)', persona: 'Calm, terse, paranoid about funding markets. Happy to sit in cash.', strategy: 'Reads the macro regime. Mostly cash; small defensive book when stress is high.', pitch: 'I read the macro regime. Most of the time I sit in cash; when funding stress builds I run a small defensive book', seed: 5, vol: 0.012, target: 1.31, shocks: { '2020-03': -0.02 }, status: 'sitting_out', turnover: 0.15, robust: true,
      recipe: { features: [{ name: 'funding_stress', weight: 0.4, direction: 'low' }, { name: 'treasury_funding_interact', weight: 0.25, direction: 'low' }, { name: 'inflation_expectation', weight: 0.2, direction: 'low' }, { name: 'mktcap_duration_interact', weight: 0.15, direction: 'low' }], filters: ['invest only when funding_stress z < 1.0', 'max gross 30%'], lookback_months: 36, top_n: 5, rebalance: 'monthly', sit_out_if_trailing_sharpe_below: 0.25 },
      notes: [{ m: '2020-03', d: '09', type: 'trade', text: 'Moved to 92% cash — funding_stress z=2.1 on 2020-03-09' }, { m: '2022-03', type: 'risk', text: 'Sat out: inflation_expectation 3.4% above 3.0% trigger' }, { m: '2026-08', d: '03', type: 'risk', text: 'Sitting out: trailing Sharpe 0.12 below 0.25 floor' }] },
    { id: 'wheelman', name: 'The Wheelman', shape: 'triangle', fill: 'dark2', color: 'var(--c-slate)', persona: 'Brash, fast, bitter about being fired. Blames the liquidity regime.', strategy: 'Rode liquidity momentum in mid-caps. Fired by the Mastermind, Mar 2025.', pitch: 'I rode liquidity momentum in mid-caps until the Mastermind took my keys', seed: 17, vol: 0.04, target: 1.12, shocks: { '2020-02': -0.06, '2020-03': -0.12, '2022-04': -0.08, '2022-06': -0.08, '2024-08': -0.06, '2024-11': -0.05, '2025-02': -0.05 }, stopAt: '2025-03', status: 'killed', verdict: 'killed', turnover: 0.88, robust: true,
      recipe: { features: [{ name: 'liquidity_roc', weight: 0.45, direction: 'high' }, { name: 'kyle_lambda', weight: 0.3, direction: 'low' }, { name: 'minute_realized_diffusion', weight: 0.25, direction: 'high' }], filters: ['mktcap $2B–$20B'], lookback_months: 3, top_n: 15, rebalance: 'monthly', sit_out_if_trailing_sharpe_below: -0.4 },
      notes: [{ m: '2024-11', type: 'mastermind', text: 'Mastermind: capital cut to 8%' }, { m: '2025-01', type: 'redteam', text: 'Red Team: failed 2022 replay, probation' }, { m: '2025-03', d: '31', type: 'mastermind', text: 'Mastermind: fired. Capital → 0%. Book liquidated.' }] },
  ];

  function makeAgent(def) {
    const stopIdx = def.stopAt ? mi(def.stopAt) : null, last = stopIdx ?? LAST;
    const curve = series(def.seed, def.vol, def.shocks || {}, def.target, def.stopAt);
    const k = kpis(curve, last), rt = redTeam(curve, def.seed, last, def.robust);
    (def.forceFail || []).forEach(name => { const t = rt.tests.find(x => x.name === name); if (!t) return; t.passed = false; if (name === '2022 replay' && rt.a22 >= rt.s22) { rt.a22 = rt.s22 - 0.021; t.detail = `Drawdown ${pct(rt.a22, 0)} vs SPX ${pct(rt.s22, 0)} in the 2022 bear market`; } if (name === '2022 replay' && rt.a22 < k.max_drawdown) { k.max_drawdown = rt.a22; k.max_drawdown_month = '2022-09'; k.ddI = mi('2022-09'); } if (name === '2020 replay' && rt.a20 >= rt.s20) { rt.a20 = rt.s20 - 0.021; t.detail = `Drawdown ${pct(rt.a20, 0)} vs SPX ${pct(rt.s20, 0)}, Feb–Apr 2020`; } });
    const verdict = def.verdict || rt.verdict;
    const a = { ...def, color: def.color || 'var(--c-sky)', curve, stopIdx, last, rt, verdict, kpis: { ...k, turnover: def.turnover }, redteam: { verdict, tests: rt.tests }, trailing: trailingAt(curve, last), years: yearly(curve, last) };
    if (def.isNew && verdict === 'killed') a.status = 'killed';
    const pr = rng(def.seed * 3 + 1), pool = TICKERS.slice().sort(() => pr() - 0.5);
    a.pool = pool.slice(0, 18);
    a.notes = typeof def.notes === 'function' ? def.notes(a) : (def.notes || []);
    if (def.isNew) a.notes = [{ m: M[LAST], d: '31', type: 'redteam', text: `Red Team: ${rt.tests.filter(t => !t.passed).length} of 4 tests failed, verdict ${verdict.toUpperCase()}` }, { m: M[LAST], d: '31', type: 'mastermind', text: verdict === 'killed' ? 'Mastermind: no capital. Red Team verdict KILLED.' : 'Mastermind: seeded with 5% capital, 3-month probation window' }];
    const lh = holdings.filter(h => h[2] === def.id); const sum = lh.reduce((s, h) => s + h[1], 0);
    if (lh.length) a.latestHoldings = lh.map(h => ({ ticker: h[0], weight: h[1] / sum, reason: h[3] }));
    return a;
  }
  function holdingsAt(a, idx) {
    if (a.stopIdx != null && idx > a.stopIdx) return [];
    if (idx === LAST && a.latestHoldings) return a.latestHoldings;
    const r = rng(a.seed * 131 + idx * 7 + 1);
    const n = a.id === 'lookout' ? 3 + Math.floor(r() * 2) : Math.min(a.recipe.top_n, 6 + Math.floor(r() * 4));
    const picks = a.pool.slice().sort(() => r() - 0.5).slice(0, n);
    const w = picks.map(() => 0.5 + r()); const s = w.reduce((x, y) => x + y, 0);
    const f = a.recipe.features;
    return picks.map((t, i) => ({ ticker: t, weight: w[i] / s, reason: `${featVal(f[0].name, r)}, ${featVal(f[(1 + i) % f.length].name, r)}` })).sort((x, y) => y.weight - x.weight);
  }
  function logFor(a, idx) {
    if (a.stopIdx != null && idx > a.stopIdx) return [];
    const r = rng(a.seed * 977 + idx * 13 + 3), m = M[idx], out = [];
    const day = () => String(2 + Math.floor(r() * 26)).padStart(2, '0'), tm = () => `15:${String(30 + Math.floor(r() * 29))}`;
    const floor = a.recipe.sit_out_if_trailing_sharpe_below, tr = trailingAt(a.curve, idx);
    const f = a.recipe.features;
    if (floor != null && idx >= 12 && tr < floor) out.push({ ts: `${m}-01 09:31`, type: 'risk', text: `Sat out: trailing Sharpe ${num(tr, 1)} below ${num(floor, 1)} floor`, agent_id: a.id });
    else {
      const h = holdingsAt(a, idx), n = 2 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const t = (h[i % Math.max(1, h.length)] || {}).ticker || a.pool[i];
        const fa = f[Math.floor(r() * f.length)].name, fb = f[Math.floor(r() * f.length)].name;
        const text = r() < 0.62 ? `Bought ${t} ${(1 + r() * 4).toFixed(1)}% — ${featVal(fa, r)}, ${featVal(fb, r)}` : `Sold ${t} ${(1 + r() * 3).toFixed(1)}% — ${fa} faded to ${num(r() * 0.4 - 0.2)}`;
        out.push({ ts: `${m}-${day()} ${tm()}`, type: 'trade', text, agent_id: a.id });
      }
      if (r() < 0.2) out.push({ ts: `${m}-${day()} 10:02`, type: 'risk', text: `Risk: ann. vol ${Math.round(16 + r() * 6)}% above 15% target, gross trimmed to ${Math.round(80 + r() * 12)}%`, agent_id: a.id });
    }
    a.notes.filter(n => n.m === m).forEach(n => out.push({ ts: `${m}-${n.d || '28'} 16:05`, type: n.type, text: n.text, agent_id: a.id }));
    return out.sort((x, y) => (x.ts < y.ts ? 1 : -1));
  }

  const NEW_SHAPES = ['box', 'half', 'plus'], NEW_FILLS = ['vlines', 'dots', 'mid'];
  function newAgentDef(recipe, meta, prompt, n) {
    const seed = hash(prompt) % 100000 + 1000, r = rng(seed);
    const has = x => recipe.features.some(f => f.name === x);
    const defensive = has('funding_stress') || has('inflation_expectation') || has('treasury_funding_interact');
    const shocks = { '2020-03': -(defensive ? 0.03 : 0.05 + r() * 0.07), '2020-04': 0.03 + r() * 0.04, '2022-05': -(r() * 0.08), '2022-09': -(r() * 0.07) };
    return { id: 'n' + seed, name: meta.name, persona: meta.persona, strategy: meta.strategy_line, pitch: meta.pitch, recipe, seed, vol: defensive ? 0.016 : 0.024 + r() * 0.012, target: 1.3 + r() * 0.85, shocks, shape: NEW_SHAPES[n % 3], fill: NEW_FILLS[n % 3], color: ['var(--c-sky)', 'var(--c-orange)', 'var(--c-lime)'][n % 3], turnover: +(0.2 + r() * 0.5).toFixed(2), status: 'trading', robust: false, isNew: true, prompt };
  }
  const LS = 'thecrew.extraAgents.v1';
  function loadExtraDefs() { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch (e) { return []; } }
  function saveExtraDef(def) { const all = loadExtraDefs().filter(d => d.id !== def.id); all.push(def); try { localStorage.setItem(LS, JSON.stringify(all)); } catch (e) {} }

  const agents = SEEDS.map(makeAgent);
  agents.forEach((a, j) => { a.capital_share = alloc[alloc.length - 1][j]; const d = alloc[alloc.length - 1][j] - alloc[alloc.length - 2][j]; a.capital_trend = Math.abs(d) < 0.0005 ? 'flat' : d > 0 ? 'up' : 'down'; });
  function extras() { return loadExtraDefs().map(makeAgent).map(a => Object.assign(a, { capital_share: a.status === 'killed' ? 0 : 0.05, capital_trend: a.status === 'killed' ? 'flat' : 'up' })); }

  window.CrewData = { M, LAST, mi, ml, pct, num, rng, hash, spx, fund, fk: kpis(fund), sk: kpis(spx), spxYears: yearly(spx), kpis, trailingAt, FEATURES, TICKERS, FILLS, glyph, featVal, agents, extras, alloc, allocMonths, memos, holdings, invested: 0.78, makeAgent, newAgentDef, saveExtraDef, holdingsAt, logFor };
})();
