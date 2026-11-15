// Dislocation-reversion bot for make.fun's btc-race-24h-20261115-0828.
//
// The harness sends one JSON line per minute (a 1-minute bar of cbBTC priced
// in dollars) and this bot answers each batch with buy and sell orders. Long
// only, paper money, deterministic: exact integer and rational arithmetic
// only, no clock, no environment, no randomness.
//
// Strategy: BTC mean-reverts after deep dislocations from its slow trend.
// When the bar's close sits 200 bps or more below the 240-bar EMA for two
// bars running, buy with all cash. Sell the whole position when the close
// recovers to the EMA, or after 240 bars, whichever comes first. A stop-loss
// 200 bps under the entry close, a 100 bps trailing stop armed at 150 bps of
// profit, and a 400 bps take-profit guard the race window against a trend
// that keeps running against the position.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch, OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const EMA_BARS = 240n;
const DISLOCATION_BPS = 200n;
const CONFIRM_BARS = 2;
const MAX_HOLD_BARS = 240;
const MAX_SLIPPAGE_BPS = 10_000;
const STOP_BPS = 200n;
const TRAIL_BPS = 100n;
const TRAIL_ARM_BPS = 150n;
const TAKE_PROFIT_BPS = 400n;
const BPS = 10_000n;

// The 240-bar EMA as an exact rational num/den, seeded with the first close.
let emaNum: bigint | null = null;
let emaDen = 1n;
let closesSeen = 0;
let dislocatedBars = 0;
let barsHeld = 0;
let entryClose: bigint | null = null;
let peakClose: bigint | null = null;

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function updateEma(close: bigint): void {
  if (emaNum === null) {
    emaNum = close;
    emaDen = 1n;
  } else {
    const num = 2n * close * emaDen + (EMA_BARS - 1n) * emaNum;
    const den = (EMA_BARS + 1n) * emaDen;
    const g = gcd(num, den);
    emaNum = num / g;
    emaDen = den / g;
  }
  closesSeen += 1;
}

function onBatch(state: BarsState, batch: Batch): OrderInput[] {
  if (state.warmingUp) return [];
  const bar = batch.bars.find((b) => b.symbol === SYMBOL);
  if (bar === undefined) return [];
  const close = BigInt(bar.c);
  updateEma(close);
  if (closesSeen <= Number(EMA_BARS)) return [];
  const ema = emaNum as bigint;
  const holding = state.positions.get(SYMBOL);
  if (holding === undefined || holding.qty === 0n) {
    const dislocated = close * BPS * emaDen < ema * (BPS - DISLOCATION_BPS);
    if (dislocated) {
      dislocatedBars += 1;
    } else {
      dislocatedBars = 0;
    }
    if (dislocatedBars >= CONFIRM_BARS) {
      dislocatedBars = 0;
      barsHeld = 0;
      entryClose = close;
      peakClose = close;
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  }
  barsHeld += 1;
  if (entryClose === null || peakClose === null) {
    entryClose = close;
    peakClose = close;
  }
  const entry = entryClose;
  if (close > peakClose) peakClose = close;
  const peak = peakClose;
  const stopped = close * BPS <= entry * (BPS - STOP_BPS);
  const tookProfit = close * BPS >= entry * (BPS + TAKE_PROFIT_BPS);
  const armed = peak * BPS >= entry * (BPS + TRAIL_ARM_BPS);
  const trailed = armed && (peak - close) * BPS >= peak * TRAIL_BPS;
  if (close * emaDen >= ema || barsHeld >= MAX_HOLD_BARS || stopped || tookProfit || trailed) {
    entryClose = null;
    peakClose = null;
    return [{ side: 'sell', symbol: SYMBOL, qty: holding.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
  }
  return [];
}

await runBars({ onBatch });
