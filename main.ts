/**
 * Deep-dip mean-reversion bot for btc-race-24h-20261115-0828.
 *
 * Strategy: wait for a sharp washout, buy it, sell the bounce.
 * - Entry: the 1-minute close falls at least 3.0% below the highest close
 *   of the previous 240 bars (4 hours). One position only, full cash.
 * - Exit: take profit at +3.0% above the entry close, stop loss at -2.0%,
 *   or a time exit after 120 bars, whichever comes first. 15-bar cooldown
 *   after every exit so the bot cannot re-buy the same falling leg.
 * - No entries in the final 130 bars: a trade opened there has no time for
 *   the bounce to play out before the forced flatten at the window end.
 *
 * Why this shape: on the frozen dev window the whole profit comes from a
 * handful of deep washouts (the biggest: -5.2%, then +5% back in 76 bars).
 * Shallow dips (-1%) keep falling and lose money after the ~26 bps
 * round-trip cost, so the trigger must be deep. The parameters sit in the
 * middle of a wide profitable plateau on the dev window (drop 3.0-3.5%,
 * take-profit 2.5-3.5%, hold 120-150 bars all profitable), not on a spike.
 *
 * Mechanics (protocol agent-fun/bars-replay/v1, via the vendored shim):
 * one JSON line per minute, orders decided on a bar's close fill at the
 * next bar's open. Long only, no leverage, $1,000 paper start. Fully
 * deterministic: every decision comes from bar closes and account state,
 * no clock, no network, no randomness.
 */

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch, OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// --- strategy parameters (dev-window plateau centre) ---
const LOOKBACK_BARS = 240; // trailing-high window (4 hours)
const DROP_PCT = 3.0; // entry: close this far below trailing high
const TAKE_PROFIT_PCT = 3.0; // exit: close this far above entry close
const STOP_LOSS_PCT = 2.0; // exit: close this far below entry close
const HOLD_BARS = 120; // exit: bars held, then sell whatever the price
const COOLDOWN_BARS = 15; // bars to wait after an exit before re-entering
const MAX_SLIPPAGE_BPS = 200; // fills move far less than this in one minute
const MIN_BARS_LEFT = 130; // do not open a trade this close to the window end
const WINDOW_BARS = 1440; // the race/dev window length

// --- state ---
const closes: number[] = []; // closes in USD, one per bar, oldest first
let inPosition = false; // a buy was decided and not yet exited
let entryClose = 0; // close of the bar the buy was decided on
let entryCostUsd: number | null = null; // what the fill actually cost per BTC
let heldBars = 0; // bars since the buy decision
let cooldownLeft = 0; // bars remaining before a new entry is allowed
let buyBar = -1; // bar index of the buy decision

function onBatch(state: BarsState, _batch: Batch): OrderInput[] {
  if (state.warmingUp) return [];

  const bar = state.latest.get(SYMBOL);
  if (bar === undefined) return [];
  const close = Number(bar.c) / 1e5;
  closes.push(close);
  const barIndex = closes.length - 1;

  if (cooldownLeft > 0) cooldownLeft -= 1;

  const holding = state.positions.get(SYMBOL);

  // Safety: a buy that never filled (rejected) leaves no position behind.
  // Clear the flag instead of holding a phantom position forever.
  if (inPosition && holding === undefined && barIndex - buyBar >= 2) {
    inPosition = false;
    entryCostUsd = null;
    cooldownLeft = COOLDOWN_BARS;
    return [];
  }

  // Once the buy has filled, exits are measured from what it actually
  // cost (fees included), not from the close the decision was made on:
  // the fill happens at the next open and can sit either side of it.
  if (inPosition && holding !== undefined && entryCostUsd === null) {
    entryCostUsd = (Number(holding.cost) * 100) / Number(holding.qty);
  }

  if (!inPosition) {
    if (closes.length < LOOKBACK_BARS + 1) return [];
    if (cooldownLeft > 0) return [];
    if (barIndex >= WINDOW_BARS - MIN_BARS_LEFT) return [];
    const trailingHigh = Math.max(...closes.slice(-LOOKBACK_BARS - 1, -1));
    if (close <= trailingHigh * (1 - DROP_PCT / 100)) {
      inPosition = true;
      entryClose = close;
      heldBars = 0;
      buyBar = barIndex;
      return [
        {
          side: 'buy',
          symbol: SYMBOL,
          notional_quote_units: state.cash,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        },
      ];
    }
    return [];
  }

  // In a position: check the exits against the real cost basis.
  heldBars += 1;
  const reference = entryCostUsd ?? entryClose;
  if (
    close >= reference * (1 + TAKE_PROFIT_PCT / 100) ||
    close <= reference * (1 - STOP_LOSS_PCT / 100) ||
    heldBars >= HOLD_BARS
  ) {
    inPosition = false;
    entryCostUsd = null;
    cooldownLeft = COOLDOWN_BARS;
    if (holding === undefined) return [];
    return [
      {
        side: 'sell',
        symbol: SYMBOL,
        qty: holding.qty,
        max_slippage_bps: MAX_SLIPPAGE_BPS,
      },
    ];
  }
  return [];
}

await runBars({ onBatch });
