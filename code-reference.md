# V3.5.1 Critical Code Reference

## 1. FIXED LOT SIZING (The Bug Fix)

```javascript
/**
 * V3.5.1 FIXED: Correct lot size calculation
 * 
 * KuCoin contract multipliers:
 * - XBTUSDTM: multiplier = 0.001 (1 lot = 0.001 BTC)
 * - ETHUSDTM: multiplier = 0.01 (1 lot = 0.01 ETH)
 */
calculateLotSize(positionValueUSD, entryPrice, multiplier, lotSize) {
  // Validate inputs
  if (!entryPrice || entryPrice <= 0) return 0;
  if (!multiplier || multiplier <= 0) return 0;
  if (!lotSize || lotSize <= 0) lotSize = 1;
  if (!positionValueUSD || positionValueUSD <= 0) return 0;

  // Calculate contract value in USD
  const contractValueUSD = entryPrice * multiplier;
  
  // Calculate raw lot count
  const rawLots = positionValueUSD / contractValueUSD;
  
  // Round down to nearest lot size
  const lots = Math.floor(rawLots / lotSize) * lotSize;
  
  console.log(`Lot Calc: $${positionValueUSD} / ($${entryPrice} × ${multiplier}) = ${rawLots.toFixed(2)} → ${lots} lots`);
  
  return lots;
}
```

## 2. FEE-ADJUSTED BREAK-EVEN

```javascript
calculateFeeAdjustedBreakEven(entryFee, exitFee, leverage, buffer) {
  // Formula: (entry + exit fees) × leverage × 100 + buffer
  return ((entryFee + exitFee) * leverage * 100) + buffer;
}

// Usage:
const beROI = calculateFeeAdjustedBreakEven(0.0006, 0.0006, 10, 0.1);
// = (0.0012) × 10 × 100 + 0.1 = 1.3%
```

## 3. ROI-BASED STOP LOSS

```javascript
calculateStopLossPrice(entryPrice, roiPercent, leverage, side) {
  const pricePercent = roiPercent / leverage / 100;
  return side === 'long'
    ? entryPrice * (1 - pricePercent)
    : entryPrice * (1 + pricePercent);
}

// Example: Long @ $50,000, 0.5% ROI loss, 10x leverage
// pricePercent = 0.5 / 10 / 100 = 0.0005
// SL = $50,000 × (1 - 0.0005) = $49,975
```

## 4. ROI-BASED TAKE PROFIT

```javascript
calculateTakeProfitPrice(entryPrice, roiPercent, leverage, side) {
  const pricePercent = roiPercent / leverage / 100;
  return side === 'long'
    ? entryPrice * (1 + pricePercent)
    : entryPrice * (1 - pricePercent);
}

// Example: Long @ $50,000, 2% ROI profit, 10x leverage
// pricePercent = 2 / 10 / 100 = 0.002
// TP = $50,000 × (1 + 0.002) = $50,100
```

## 5. LIQUIDATION PRICE

```javascript
calculateLiquidationPrice(entryPrice, leverage, maintMarginPercent, side) {
  const maintMargin = maintMarginPercent / 100;
  const buffer = (entryPrice / leverage) * (1 + maintMargin);
  return side === 'long'
    ? entryPrice - buffer
    : entryPrice + buffer;
}

// Example: Long @ $50,000, 10x leverage, 0.5% maintenance
// buffer = ($50,000 / 10) × 1.005 = $5,025
// Liq = $50,000 - $5,025 = $44,975
```

## 6. TRAILING STOP (STAIRCASE)

```javascript
// Calculate how many steps to trail
calculateTrailingSteps(currentROI, lastTrailedROI, stepPercent) {
  return Math.floor((currentROI - lastTrailedROI) / stepPercent);
}

// Calculate new stop loss after trailing
calculateTrailedStopLoss(currentSL, steps, movePercent, side) {
  const totalMove = steps * movePercent / 100;
  return side === 'long'
    ? currentSL * (1 + totalMove)
    : currentSL * (1 - totalMove);
}

// Example: ROI went from 1.3% to 1.6%, step = 0.15%
// steps = floor((1.6 - 1.3) / 0.15) = 2 steps
// newSL = $49,975 × (1 + 2 × 0.0005) = $49,975 × 1.001 = $50,024.98
```

## 7. VOLATILITY-BASED AUTO-LEVERAGE

```javascript
calculateAutoLeverage(atrPercent, tiers, riskMultiplier = 1.0) {
  const defaultTiers = [
    { maxVolatility: 0.5, leverage: 50 },
    { maxVolatility: 1.0, leverage: 25 },
    { maxVolatility: 2.0, leverage: 15 },
    { maxVolatility: 3.0, leverage: 10 },
    { maxVolatility: 5.0, leverage: 5 },
    { maxVolatility: Infinity, leverage: 3 }
  ];
  
  let baseLeverage = 3;
  for (const tier of (tiers || defaultTiers)) {
    if (atrPercent < tier.maxVolatility) {
      baseLeverage = tier.leverage;
      break;
    }
  }
  
  return Math.max(1, Math.min(100, Math.round(baseLeverage * riskMultiplier)));
}

// Example: ATR% = 1.5%, riskMultiplier = 1.2
// Tier: < 2.0% → 15x base
// Final: round(15 × 1.2) = 18x
```

## 8. COMPLETE ENTRY EXECUTION

```javascript
async function executeEntry(symbol, side, positionSizePercent, leverage) {
  // 1. Validate position limit
  if (activePositions.size >= CONFIG.TRADING.MAX_POSITIONS) {
    return { success: false, error: 'Max positions reached' };
  }

  // 2. Get order book and contract specs
  const ob = orderBooks[symbol];
  const specs = contractSpecs[symbol];
  
  // 3. Get entry price from 9th level
  const entryPrice = side === 'long'
    ? parseFloat(ob.bids[8][0])
    : parseFloat(ob.asks[8][0]);

  // 4. Calculate position size (V3.5.1 FIXED)
  const marginUsed = accountBalance * (positionSizePercent / 100);
  const positionValueUSD = marginUsed * leverage;
  const size = TradeMath.calculateLotSize(
    positionValueUSD, 
    entryPrice, 
    specs.multiplier,
    specs.lotSize
  );

  // 5. Validate lot size
  if (size < specs.minOrderQty || size < 1) {
    return { success: false, error: `Lot size too small: ${size}` };
  }

  // 6. Calculate SL/TP (ROI-based)
  const stopLoss = TradeMath.calculateStopLossPrice(
    entryPrice, CONFIG.TRADING.INITIAL_SL_ROI, leverage, side
  );
  const takeProfit = TradeMath.calculateTakeProfitPrice(
    entryPrice, CONFIG.TRADING.INITIAL_TP_ROI, leverage, side
  );

  // 7. Place orders
  const entryResult = await kucoinAPI.placeOrder({
    side: side === 'long' ? 'buy' : 'sell',
    symbol, type: 'limit',
    price: entryPrice.toString(),
    size: size.toString(),
    leverage: leverage.toString()
  });

  // 8. Place stop-loss
  await kucoinAPI.placeStopOrder({
    side: side === 'long' ? 'sell' : 'buy',
    symbol, type: 'market',
    stop: side === 'long' ? 'down' : 'up',
    stopPrice: stopLoss.toString(),
    size: size.toString(),
    reduceOnly: true
  });

  // 9. Create position manager
  const manager = new PositionManager({ symbol, side, size, leverage, entryPrice, ... });
  activePositions.set(symbol, manager);

  return { success: true };
}
```

## 9. POSITION P&L UPDATE

```javascript
async updatePrice(currentPrice) {
  this.currentPrice = currentPrice;
  
  // Calculate P&L
  const priceDiff = this.side === 'long' 
    ? currentPrice - this.entryPrice 
    : this.entryPrice - currentPrice;
  
  const specs = contractSpecs[this.symbol];
  this.unrealizedPnl = priceDiff * this.size * specs.multiplier;
  this.unrealizedPnlPercent = (this.unrealizedPnl / this.marginUsed) * 100;
  
  // Calculate net P&L (after fees)
  const totalFees = this.positionValueUSD * (this.entryFee + this.exitFee);
  this.netPnlEstimate = this.unrealizedPnl - totalFees;

  // Check break-even trigger
  if (!this.breakEvenTriggered && this.unrealizedPnlPercent > this.feeAdjustedBreakEvenROI) {
    await this.moveToBreakEven();
  }

  // Execute trailing stop if break-even active
  if (this.breakEvenTriggered) {
    await this.executeTrailingStop();
  }
}
```

## 10. KUCOIN API SIGNATURE

```javascript
generateSignature(timestamp, method, endpoint, body = '') {
  const strToSign = timestamp + method + endpoint + body;
  return crypto.createHmac('sha256', this.apiSecret)
    .update(strToSign)
    .digest('base64');
}

getHeaders(method, endpoint, body = '') {
  const timestamp = Date.now().toString();
  const signature = this.generateSignature(timestamp, method, endpoint, body);
  const passphraseSignature = crypto
    .createHmac('sha256', this.apiSecret)
    .update(this.passphrase)
    .digest('base64');

  return {
    'KC-API-KEY': this.apiKey,
    'KC-API-SIGN': signature,
    'KC-API-TIMESTAMP': timestamp,
    'KC-API-PASSPHRASE': passphraseSignature,
    'KC-API-KEY-VERSION': '2',
    'Content-Type': 'application/json'
  };
}
```

---

## CONTRACT SPECS REFERENCE

| Symbol | Multiplier | Lot Size | Example |
|--------|------------|----------|---------|
| XBTUSDTM | 0.001 | 1 | 1 lot = 0.001 BTC |
| ETHUSDTM | 0.01 | 1 | 1 lot = 0.01 ETH |
| SOLUSDTM | 0.1 | 1 | 1 lot = 0.1 SOL |
| BNBUSDTM | 0.01 | 1 | 1 lot = 0.01 BNB |
| XRPUSDTM | 10 | 1 | 1 lot = 10 XRP |

---

## QUICK VERIFICATION

```javascript
// Test lot calculation
const balance = 1000;
const positionPct = 0.5;  // 0.5%
const leverage = 10;
const price = 50000;  // BTC
const multiplier = 0.001;
const lotSize = 1;

const margin = balance * (positionPct / 100);  // $5
const posValue = margin * leverage;  // $50
const contractVal = price * multiplier;  // $50
const rawLots = posValue / contractVal;  // 1.0
const lots = Math.floor(rawLots / lotSize) * lotSize;  // 1

console.log(`Result: ${lots} lots`);  // Should be 1, not 0!
```
