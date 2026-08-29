# Screen 02 — Trading Workspace

Route: `/trade/[symbol]`

Access: Market data public; order placement authenticated.

This is the portfolio's most important screen.

## 1. Goal

Present multiple high-frequency market-data widgets in one coherent responsive workspace while keeping render boundaries independent.

## 2. Desktop layout

```text
┌──────────────────────────────────────────────────────────────┐
│ MarketHeader: BTC/USD | $67,542 | +2.41% | H/L/Volume | Live│
├────────────────────────────────────┬─────────────────────────┤
│                                    │ Order Book              │
│                                    │ asks                    │
│        Candlestick Chart           │ current                 │
│                                    │ bids                    │
│                                    │                         │
├────────────────────────────────────┼─────────────────────────┤
│ Recent Trades                      │ Order Form              │
│                                    │ BUY / SELL              │
│                                    │ MARKET / LIMIT          │
└────────────────────────────────────┴─────────────────────────┘
```

Recommended relative importance:

- Chart receives the most space.
- Order book narrow but readable.
- Order form stays visible without excessive scroll on common desktop sizes.

## 3. Mobile layout

```text
MarketHeader
Chart
Timeframe selector
Tabs: [Order Book] [Trades]
Selected realtime panel
Order Form
```

Optionally make order form a bottom-sheet action after UX is stable, but do not hide core functionality excessively for the first implementation.

## 4. Component tree

```text
TradingPage
├─ TradingMarketHeader
│  ├─ SymbolIdentity
│  ├─ LivePrice
│  ├─ Change24h
│  ├─ MarketStats
│  └─ ConnectionStatus
├─ TradingGrid
│  ├─ ChartPanel
│  │  ├─ TimeframeTabs
│  │  ├─ CandlestickChart
│  │  └─ ChartStateOverlay
│  ├─ OrderBookPanel
│  │  ├─ OrderBookHeader
│  │  ├─ AskRows
│  │  ├─ MidPrice
│  │  └─ BidRows
│  ├─ RecentTradesPanel
│  │  └─ RecentTradeRow[]
│  └─ OrderEntryPanel
│     ├─ BuySellTabs
│     ├─ MarketLimitTabs
│     ├─ AvailableBalance
│     ├─ QuantityInput
│     ├─ LimitPriceInput (conditional)
│     ├─ EstimatedValue
│     └─ SubmitOrderButton
└─ MobileRealtimeTabs
```

## 5. Data dependencies

### REST

- Supported market metadata.
- Historical candles.
- Auth/user.
- Portfolio/balance summary for order form if logged in.

### Realtime

- ticker.
- current candle.
- order-book snapshot/deltas.
- recent trade batches.
- live/stale state.

## 6. Route lifecycle

On symbol change:

1. Validate supported symbol.
2. Unsubscribe previous market channels.
3. Reset symbol-specific order-book/trade view state.
4. Load historical candle set for new symbol/timeframe.
5. Subscribe ticker/candles/orderbook/trades for new symbol.
6. Apply fresh order-book snapshot before deltas.

## 7. Market header

Required fields:

- BTC/USD style identity.
- Current price.
- 24h percentage.
- High.
- Low.
- Volume.
- Live/reconnecting/stale status.

Do not let all header labels rerender unnecessarily if only current price changes.

## 8. Chart panel

### Required

- Historical candles.
- Realtime current candle.
- 1m/5m/15m/1h selector.
- Resize.
- Pan/zoom.

### Loading

- Keep panel height stable using skeleton.

### Interval change

- Cancel/ignore stale previous request result.
- Load new history.
- Update realtime candle subscription/aggregation contract as required.

### Error

- Chart panel shows retry without breaking order book/order form.

## 9. Order book panel

Rows:

```text
Price | Amount | optional cumulative/depth visual
```

Rules:

- Top N only.
- Snapshot then deltas.
- Zero quantity removes row.
- Stable decimal formatting.
- Mid price comes from trusted latest ticker/book state.

Performance:

- Internal book can ingest faster than React presentation cadence.

## 10. Recent trades panel

Fields:

- Price.
- Quantity.
- Time.
- Side.

Rules:

- Maximum 50 visible/stored items in basic UI.
- Newest first.
- Avoid distracting animations.

## 11. Order form

### Tabs

Side:

- BUY.
- SELL.

Type:

- MARKET.
- LIMIT.

### Market mode

Inputs:

- Quantity.

Displays:

- Current indicative price.
- Estimated notional.
- Available asset balance.

Disclaimer:

- Estimated current price is not client-authoritative execution truth.

### Limit mode

Inputs:

- Limit price.
- Quantity.

Displays:

- Estimated reserved amount.
- Available/locked balance.

### Guest behavior

User can inspect form but submit action should route/open sign-in requirement clearly.

### Validation

- Positive quantity.
- Positive limit price when LIMIT.
- Supported decimal scale.
- Do not rely only on frontend balance validation; backend revalidates.

### Submission

- Disable duplicate submit while mutation in flight.
- On success: success feedback + refresh/patch portfolio/orders.
- On stable business error: field/form message.
- On network error: retry guidance.

## 12. Realtime states

### CONNECTED

Show `Live`.

### RECONNECTING

- Keep last rendered values.
- Mark clearly.
- Do not clear chart/book to blank immediately.

### STALE

- Mark data delayed.
- Disable order submission if backend would reject stale execution.

## 13. Invalid symbol

Unsupported route such as `/trade/ABC-XYZ`:

- Show unsupported market state.
- Offer link back to market overview.
- Do not open provider subscriptions.

## 14. Accessibility

- Tabs keyboard accessible.
- Order form labels explicit.
- Error text associated to inputs.
- Realtime updates should not create aggressive screen-reader announcements on every tick.

## 15. Acceptance criteria

- [ ] Valid symbol loads real chart history.
- [ ] Ticker updates live.
- [ ] Current candle updates.
- [ ] Order book updates from snapshot + deltas.
- [ ] Recent trades bounded and live.
- [ ] Symbol navigation cleans subscriptions.
- [ ] Market order works after auth.
- [ ] Limit order form works after auth.
- [ ] Reconnect/stale state visible.
- [ ] Mobile screen is usable and reorganized.
