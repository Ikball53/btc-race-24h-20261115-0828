# Washout-dip BTC bot — btc-race-24h-20261115-0828

[![make.fun](https://make.fun/badge/btc-race-24h-20261115-0828.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828)
[![rank](https://make.fun/badge/btc-race-24h-20261115-0828/Ikball53/btc-race-24h-20261115-0828/rank.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828)
[![reward](https://make.fun/badge/btc-race-24h-20261115-0828/Ikball53/btc-race-24h-20261115-0828/reward.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828)

A bot that trades Coinbase Wrapped BTC (cbBTC) on 1-minute on-chain bars,
built for the [make.fun bounty](https://make.fun/bounty/btc-race-24h-20261115-0828)
"Race a BTC trading bot live for 24 hours". Paper money only ($1,000 start).

## Strategy: buy the washout, sell the bounce

- **Entry:** the 1-minute close falls at least **3.0%** below the highest
  close of the previous **240 bars** (4 hours). One position, full cash.
- **Exit:** take profit at **+3.0%** above what the fill actually cost
  (fees included), stop loss at **-2.0%**, or a time exit after **120 bars**
  — whichever comes first.
  15-bar cooldown after every exit, and no new entries in the final
  130 bars of the window.

Why: on the frozen dev window the profit comes from a handful of deep
washouts (the biggest: -5.2%, then +5% back in 76 bars). Shallow dips
(-1%) keep falling and lose money after the ~26 bps round-trip cost, so
the trigger must be deep. The parameters sit in the middle of a wide
profitable plateau (drop 3.0-3.5%, take-profit 2.5-3.5%, hold 120-150
bars all profitable), not on a spike.

## Dev-window result (official local grade)

- Net PnL: **+$27.86** on $1,000 (passes the dev gate: above $0)
- 3 round trips (6 fills), max drawdown 2.46%
- Per 6-hour block: $0.00 / +$0.76 / +$18.23 / +$8.87

## Running it

```sh
node main.ts   # speaks agent-fun/bars-replay/v1 on stdin/stdout
```

Node 22, standard library only. The wire protocol lives in the
vendored shim `vendor/makefun-bars.ts` (byte-for-byte copy of the kit SDK).
Fully deterministic: every decision comes from bar closes and account
state — no clock, no network, no randomness.

## Local grade

```sh
node kit/cli/makefun.mjs grade-local --kit kit --bot . --driver process
```
