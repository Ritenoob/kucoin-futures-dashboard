# V3.4.4 - HEDGE MODE FULL IMPLEMENTATION

## What Changed

**Added full KuCoin hedge mode (two-way positioning) support:**

### 1. Configuration
```javascript
HEDGE_MODE: true,                // Enable two-way positioning
POSITION_SIDE_AUTO: true,        // Auto-set positionSide from trade direction
```

### 2. API Method
```javascript
async setPositionMode(hedged = true) {
  const params = {
    symbol: 'XBTUSDTM',
    mode: hedged ? 'HEDGE' : 'ONEWAY'
  };
  return this.request('POST', '/api/v1/position/margin/mode', params);
}
```

### 3. Order Parameters
All order types now include:
```javascript
marginMode: CONFIG.TRADING.MARGIN_MODE,    // 'CROSS'
positionSide: side === 'long' ? 'LONG' : 'SHORT'
```

**Applied to:**
- Entry orders
- Stop loss orders
- Take profit orders
- Position closing orders
- Stop loss updates

### 4. Startup Initialization
System automatically enables hedge mode on startup:
```javascript
if (CONFIG.TRADING.HEDGE_MODE) {
  await kucoinAPI.setPositionMode(true);
  broadcastLog('success', '🎯 Hedge mode enabled');
}
```

## What Hedge Mode Enables

**Two-way positioning:** Hold long and short positions simultaneously on same symbol
**Independent management:** Each side has separate SL/TP/trailing stops
**Risk management:** Hedge long-term positions with short-term counter-trades
**Position sides:** Orders explicitly declare LONG or SHORT leg

## Technical Details

Based on KuCoin API documentation:
- Requires `positionSide` field in all futures orders
- Both legs use same margin type (CROSS) and leverage
- Cannot switch modes with open positions
- Orders with `reduceOnly: true` decrease position size without reversing

## Usage

System automatically:
1. Enables hedge mode on startup
2. Sets `positionSide` on all orders based on trade direction
3. Manages long and short positions independently

No configuration changes needed - works out of the box.

## Version History

- **v3.4.4:** Full hedge mode implementation with positionSide
- **v3.4.3:** Bug fixes (marginMode, indicators, depth, momentum)
- **v3.4.2:** ROI-based SL/TP
- **v3.4.1:** Leverage-adjusted placement

---

**Status:** ✅ Production Ready  
**All bugs fixed + hedge mode implemented**
