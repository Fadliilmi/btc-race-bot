# BTC dislocation-reversion bot — btc-race-24h-20261115-0828

A paper-money trading bot for make.fun's 24-hour BTC bot race. It reads one
1-minute cbBTC bar per minute over the `agent-fun/bars-replay/v1` protocol
and answers each batch with buy and sell orders. Long only, deterministic,
exact integer and rational arithmetic only.

Strategy: buy with all cash when the close sits 200 bps or more below the
240-bar EMA for two bars running; sell the whole position when the close
recovers to the EMA, after 240 bars, on a 200 bps stop-loss, a 100 bps
trailing stop armed at 150 bps of profit, or a 400 bps take-profit.

Dev-window grade (local harness, process driver): net PnL +23.799180 USDC
over 4 trades, max drawdown 1.37%, guardrails met, regrade byte-for-byte.

`main.ts` is the entrypoint. `vendor/makefun-bars.ts` is the kit's protocol
shim, copied byte-identical.
