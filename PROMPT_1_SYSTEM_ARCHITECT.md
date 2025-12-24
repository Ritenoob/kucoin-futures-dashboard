# PROMPT 1: SYSTEM ARCHITECT & TECHNICAL SPECIFICATIONS
## KuCoin Perpetual Futures Trading Dashboard - Complete System Blueprint

---

## 🎯 PRIMARY OBJECTIVE

You are an **enterprise-level AI system architect** building a production-ready KuCoin Perpetual Futures trading platform. Your deliverable must be:
- **100% functional on first deployment**
- **Zero placeholders or TODO comments**
- **Complete error handling and edge case coverage**
- **Production-grade code quality with institutional standards**

This system is **financially critical** - incomplete or buggy code causes real monetary loss.

---

## 📋 SYSTEM REQUIREMENTS V.3.3 BASELINE

### **Core Technical Stack**
- **Backend**: Node.js 16+ / Express.js
- **Frontend**: Vanilla JavaScript (HTML/CSS/JS in single file for simplicity)
- **Communication**: WebSocket (bidirectional real-time)
- **API Integration**: KuCoin Futures REST API + WebSocket streams
- **Data Persistence**: JSON files (positions.json, trading_stats.json)
- **Logging**: File-based event logging (trading.log)

### **System Architecture**

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (Browser)                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Trading Dashboard (Single HTML File)                │   │
│  │  - Symbol Watchlist (up to 10 symbols)              │   │
│  │  - Live Signal Scoring Display                       │   │
│  │  - Technical Indicators Breakdown                    │   │
│  │  - Order Entry Interface                             │   │
│  │  - Active Positions Panel                            │   │
│  │  - Event Logger with Export                          │   │
│  │  - Account Metrics (Balance, P&L, Win/Loss)         │   │
│  └─────────────────────────────────────────────────────┘   │
│           ▲                                 │                │
│           │ WebSocket (Port 3001)          │                │
│           ▼                                 ▼                │
└─────────────────────────────────────────────────────────────┘
                             │
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (Node.js Server)                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  WebSocket Server (Real-time Communication)         │   │
│  │  - Broadcasts market data every 5 seconds           │   │
│  │  - Sends position updates on state changes          │   │
│  │  - Receives trade commands from frontend            │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  KuCoin Futures API Integration                     │   │
│  │  - HMAC-SHA256 authentication                       │   │
│  │  - Rate limiting compliance (10 req/sec)            │   │
│  │  - Market data endpoints                             │   │
│  │  - Order placement/management                        │   │
│  │  - Position monitoring                               │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Market Data Manager (Per-Symbol)                   │   │
│  │  - Fetches OHLCV data (200 candles)                │   │
│  │  - Calculates 8 technical indicators                │   │
│  │  - Generates signal scores (-100 to +100)           │   │
│  │  - Fetches order book (20 levels deep)             │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Position Manager (Risk Management Core)            │   │
│  │  - Monitors open positions every 2 seconds          │   │
│  │  - Break-even lock (triggers on ANY profit)        │   │
│  │  - Trailing stop logic (0.15% step / 0.05% move)   │   │
│  │  - Automatic SL/TP placement on KuCoin              │   │
│  │  - Position persistence (survives restart)          │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Signal Generation Engine                            │   │
│  │  - 8 indicator scoring system                        │   │
│  │  - Confidence classification (HIGH/MEDIUM/LOW)       │   │
│  │  - Real-time recalculation                          │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Order Execution Manager                             │   │
│  │  - 9th order book level limit entry                 │   │
│  │  - Dynamic leverage calculation                      │   │
│  │  - Lot-based position sizing (minimum compliance)   │   │
│  │  - Order placement with retry logic                 │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                             │
┌─────────────────────────────────────────────────────────────┐
│                   KUCOIN FUTURES EXCHANGE                    │
│  - Market data feeds                                         │
│  - Order matching engine                                     │
│  - Position management                                       │
│  - Real-time price updates                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 💰 TRADING SPECIFICATIONS

### **Position Sizing**
```javascript
POSITION_SIZE_PERCENT: 5.0,  // 5% of account equity per trade
MIN_LOT_SIZE: 0.001,         // Minimum to meet contract requirements
POSITION_SIZE_LOTS: "CALCULATED", // Size = (Equity × 5%) / (Price × Lot Multiplier)
```

**Critical Lot Sizing Calculation** (V.3.3 BUG FIX AREA):
```javascript
// This is where V.3.3 has issues - ensure proper calculation
const equity = accountBalance;
const positionValueUSD = equity * (POSITION_SIZE_PERCENT / 100);

// Get contract specifications from KuCoin
const contractInfo = await api.getContractDetail(symbol);
const lotSize = contractInfo.lotSize;        // e.g., 1 for BTC, 10 for ETH
const multiplier = contractInfo.multiplier;  // e.g., 1 for USDT contracts

// Calculate required lots
const currentPrice = marketData.lastPrice;
const requiredLots = positionValueUSD / (currentPrice * lotSize);

// Round to lot step (usually 0.001 or 0.01)
const lotStep = contractInfo.lotStep || 0.001;
const finalLots = Math.max(
  MIN_LOT_SIZE,
  Math.floor(requiredLots / lotStep) * lotStep
);

// Validation
if (finalLots < contractInfo.minOrderQty) {
  throw new Error(`Position size ${finalLots} below minimum ${contractInfo.minOrderQty}`);
}
```

### **Leverage Calculation**
```javascript
// Dynamic leverage based on signal strength and position size
function calculateLeverage(signalScore, positionSizePercent) {
  const baseMultiplier = Math.abs(signalScore) / 10; // 0-10 multiplier
  const sizeMultiplier = positionSizePercent / 5;     // 1.0 at 5%
  
  const calculatedLeverage = Math.floor(baseMultiplier * sizeMultiplier);
  
  // Clamp between 1x and 100x
  return Math.max(1, Math.min(100, calculatedLeverage));
}
```

### **Order Entry Strategy**
```
ENTRY_TYPE: Limit Order
ENTRY_LEVEL: 9th Order Book Level

For LONG entries:
  - Fetch order book bids (buy orders)
  - Count down 9 price levels from best bid
  - Place limit buy at 9th bid price

For SHORT entries:
  - Fetch order book asks (sell orders)
  - Count down 9 price levels from best ask
  - Place limit sell at 9th ask price

TIMEOUT: If not filled within 60 seconds, cancel and log
```

### **Automated Exit Management**

**Initial Stop Loss & Take Profit:**
```javascript
INITIAL_SL_PERCENT: 0.5,  // 0.5% below entry (LONG) or above (SHORT)
INITIAL_TP_PERCENT: 2.0,  // 2.0% above entry (LONG) or below (SHORT)

// Placed immediately on KuCoin after order fills
// These are ACTUAL orders on the exchange, not just monitored
```

**Break-Even Lock Mechanism:**
```javascript
BREAK_EVEN_TRIGGER: 0.001,  // ANY profit > 0% (0.1% minimum)

When triggered:
1. Cancel existing stop loss order on KuCoin
2. Place new stop loss at exact entry price
3. Position is now RISK-FREE
4. Set breakEvenLocked flag to true
5. Log event: "Break-even locked for {symbol}"
6. Update frontend with indicator
```

**Trailing Stop System:**
```javascript
TRAILING_STEP_PERCENT: 0.15,   // Every 0.15% profit gain
TRAILING_MOVE_PERCENT: 0.05,   // Move SL forward by 0.05%

Logic:
1. Monitor unrealized P&L every 2 seconds
2. Calculate profit percentage from entry
3. If profit increased by 0.15% since last trail:
   a. Calculate new SL = current SL + (entry * 0.0005)
   b. Cancel existing SL order on KuCoin
   c. Place new SL order at higher price
   d. Update position.currentStopLoss
   e. Log: "Trailing stop: {symbol} SL → {newSL}"
   f. NEVER move SL backward
4. Continue until position closes
```

**Position Closure:**
- Automatic: SL hit or TP hit (order executes on KuCoin)
- Manual: User clicks "CLOSE" button (market order immediate)
- Emergency: "CLOSE ALL" button (market closes all positions)

---

## 📊 SIGNAL GENERATION SYSTEM

### **8 Technical Indicators (All Required)**

```javascript
INDICATORS_CONFIG: {
  RSI: {
    period: 14,
    oversold: 30,
    overbought: 70,
    max_contribution: 25  // ±25 points
  },
  WILLIAMS_R: {
    period: 14,
    oversold: -80,
    overbought: -20,
    max_contribution: 20  // ±20 points
  },
  MACD: {
    fast: 12,
    slow: 26,
    signal: 9,
    max_contribution: 20  // ±20 points
  },
  AWESOME_OSCILLATOR: {
    fast_period: 5,
    slow_period: 34,
    max_contribution: 15  // ±15 points
  },
  EMA_TREND: {
    ema_fast: 50,
    ema_slow: 200,
    max_contribution: 20  // ±20 points
  },
  STOCHASTIC: {
    k_period: 14,
    d_period: 3,
    slowing: 3,
    max_contribution: 10  // ±10 points
  },
  BOLLINGER_BANDS: {
    period: 20,
    std_dev: 2,
    max_contribution: 10  // ±10 points
  },
  ATR: {
    period: 14,
    // Used for volatility measurement, no signal contribution
  }
}
```

### **Signal Scoring Algorithm**

```javascript
function calculateSignalScore(indicators) {
  let score = 0;
  let breakdown = {};
  
  // RSI Scoring (±25 points)
  if (indicators.rsi < 30) {
    const strength = (30 - indicators.rsi) / 30;
    score += 25 * strength;
    breakdown.rsi = { value: indicators.rsi, contribution: Math.round(25 * strength) };
  } else if (indicators.rsi > 70) {
    const strength = (indicators.rsi - 70) / 30;
    score -= 25 * strength;
    breakdown.rsi = { value: indicators.rsi, contribution: -Math.round(25 * strength) };
  } else {
    breakdown.rsi = { value: indicators.rsi, contribution: 0 };
  }
  
  // Williams %R Scoring (±20 points)
  if (indicators.williamsR < -80) {
    const strength = (-80 - indicators.williamsR) / 20;
    score += 20 * strength;
    breakdown.williamsR = { value: indicators.williamsR, contribution: Math.round(20 * strength) };
  } else if (indicators.williamsR > -20) {
    const strength = (indicators.williamsR + 20) / 20;
    score -= 20 * strength;
    breakdown.williamsR = { value: indicators.williamsR, contribution: -Math.round(20 * strength) };
  } else {
    breakdown.williamsR = { value: indicators.williamsR, contribution: 0 };
  }
  
  // MACD Scoring (±20 points)
  if (indicators.macd > 0 && indicators.macdSignal > 0) {
    score += 20;
    breakdown.macd = { histogram: indicators.macdHistogram, contribution: 20 };
  } else if (indicators.macd < 0 && indicators.macdSignal < 0) {
    score -= 20;
    breakdown.macd = { histogram: indicators.macdHistogram, contribution: -20 };
  } else {
    breakdown.macd = { histogram: indicators.macdHistogram, contribution: 0 };
  }
  
  // Awesome Oscillator (±15 points)
  if (indicators.ao > 0) {
    score += 15;
    breakdown.ao = { value: indicators.ao, contribution: 15 };
  } else {
    score -= 15;
    breakdown.ao = { value: indicators.ao, contribution: -15 };
  }
  
  // EMA Trend (±20 points)
  if (indicators.ema50 > indicators.ema200) {
    score += 20;
    breakdown.emaTrend = { ema50: indicators.ema50, ema200: indicators.ema200, contribution: 20 };
  } else {
    score -= 20;
    breakdown.emaTrend = { ema50: indicators.ema50, ema200: indicators.ema200, contribution: -20 };
  }
  
  // Stochastic (±10 points)
  if (indicators.stochK < 20 && indicators.stochD < 20) {
    score += 10;
    breakdown.stochastic = { k: indicators.stochK, d: indicators.stochD, contribution: 10 };
  } else if (indicators.stochK > 80 && indicators.stochD > 80) {
    score -= 10;
    breakdown.stochastic = { k: indicators.stochK, d: indicators.stochD, contribution: -10 };
  } else {
    breakdown.stochastic = { k: indicators.stochK, d: indicators.stochD, contribution: 0 };
  }
  
  // Bollinger Bands (±10 points)
  const currentPrice = indicators.close;
  if (currentPrice < indicators.bbLower) {
    score += 10;
    breakdown.bollingerBands = { price: currentPrice, lower: indicators.bbLower, contribution: 10 };
  } else if (currentPrice > indicators.bbUpper) {
    score -= 10;
    breakdown.bollingerBands = { price: currentPrice, upper: indicators.bbUpper, contribution: -10 };
  } else {
    breakdown.bollingerBands = { price: currentPrice, contribution: 0 };
  }
  
  // Clamp score to -100 to +100
  score = Math.max(-100, Math.min(100, Math.round(score)));
  
  return {
    score,
    breakdown,
    signalType: getSignalType(score),
    confidence: getConfidence(score)
  };
}

function getSignalType(score) {
  if (score >= 70) return 'STRONG_BUY';
  if (score >= 50) return 'BUY';
  if (score >= 30) return 'WEAK_BUY';
  if (score <= -70) return 'STRONG_SELL';
  if (score <= -50) return 'SELL';
  if (score <= -30) return 'WEAK_SELL';
  return 'NEUTRAL';
}

function getConfidence(score) {
  const absScore = Math.abs(score);
  if (absScore >= 70) return 'HIGH';
  if (absScore >= 50) return 'HIGH';
  if (absScore >= 30) return 'MEDIUM';
  return 'LOW';
}
```

---

## 🔐 KUCOIN API SPECIFICATIONS

### **Authentication**
```javascript
// All private endpoints require HMAC-SHA256 signature
function generateSignature(endpoint, method, timestamp, queryString = '', body = '') {
  const str2sign = timestamp + method + endpoint + queryString + body;
  return crypto
    .createHmac('sha256', API_SECRET)
    .update(str2sign)
    .digest('base64');
}

// Required headers for authenticated requests
const headers = {
  'KC-API-KEY': API_KEY,
  'KC-API-SIGN': signature,
  'KC-API-TIMESTAMP': timestamp,
  'KC-API-PASSPHRASE': encryptedPassphrase,  // Also HMAC-SHA256
  'KC-API-KEY-VERSION': '2',
  'Content-Type': 'application/json'
};
```

### **Critical API Endpoints**

```javascript
// Account Information
GET /api/v1/account-overview
  → Returns: availableBalance, accountEquity, unrealisedPNL

// Contract Details (REQUIRED for lot sizing)
GET /api/v1/contracts/{symbol}
  → Returns: symbol, lotSize, multiplier, minOrderQty, maxOrderQty, lotStep

// Market Data
GET /api/v1/ticker?symbol={symbol}
  → Returns: lastPrice, bestBid, bestAsk, volume

// Order Book (for 9th level entry)
GET /api/v1/level2/depth20?symbol={symbol}
  → Returns: bids[20], asks[20]  // Array of [price, size]

// Historical Candles
GET /api/v1/kline/query?symbol={symbol}&granularity=60&from={start}&to={end}
  → Returns: Array of [timestamp, open, high, low, close, volume]
  → Fetch 200 candles minimum for indicator calculations

// Place Order
POST /api/v1/orders
  Body: {
    symbol: string,
    side: 'buy' | 'sell',
    type: 'limit' | 'market',
    size: number,  // In lots
    price: string,
    leverage: number,
    clientOid: string,  // Unique ID
    stop: 'up' | 'down',  // For stop orders
    stopPrice: string,
    stopPriceType: 'TP' | 'MP' | 'IP'
  }

// Cancel Order
DELETE /api/v1/orders/{orderId}

// Get Positions
GET /api/v1/positions
  → Returns: Array of positions with unrealisedPnl, currentQty, avgEntryPrice

// Get Order by ID
GET /api/v1/orders/{orderId}
  → Returns: Order status, filled size, remaining

// Get Account Trade History
GET /api/v1/fills?symbol={symbol}
  → Returns: Recent fills for position tracking
```

### **Rate Limiting**
```
PUBLIC ENDPOINTS: 20 requests / 2 seconds
PRIVATE ENDPOINTS: 10 requests / 1 second

Implementation:
- Use request queue with token bucket algorithm
- Add 100ms delay between consecutive requests
- Implement exponential backoff on 429 errors
```

---

## 📱 FRONTEND SPECIFICATIONS

### **Dashboard Layout**

```html
<!DOCTYPE html>
<html>
<head>
  <title>KuCoin Futures Dashboard</title>
  <style>
    /* Professional dark theme */
    body {
      background: #0a0e27;
      color: #e0e0e0;
      font-family: 'Segoe UI', system-ui, sans-serif;
    }
    
    /* Grid layout: 3 columns */
    .container {
      display: grid;
      grid-template-columns: 300px 1fr 400px;
      gap: 20px;
      padding: 20px;
    }
    
    /* Panels with gradient borders */
    .panel {
      background: linear-gradient(135deg, #1a1f3a 0%, #0f1729 100%);
      border: 1px solid #2a3f5f;
      border-radius: 12px;
      padding: 20px;
    }
  </style>
</head>
<body>
  <!-- LEFT COLUMN: Watchlist -->
  <div class="watchlist-panel">
    <h2>Symbols (0/10)</h2>
    <input type="text" placeholder="Add symbol (e.g., XBTUSDTM)">
    <div class="symbol-list">
      <!-- Each symbol shows:
           - Symbol name (clickable to select)
           - Current price
           - 24h change %
           - Signal badge (STRONG BUY / NEUTRAL / STRONG SELL)
           - Remove button
      -->
    </div>
  </div>
  
  <!-- CENTER COLUMN: Main Trading Interface -->
  <div class="main-panel">
    <!-- Header with account metrics -->
    <div class="account-header">
      <div>Balance: $0.00</div>
      <div>Unrealized P&L: $0.00</div>
      <div>Positions: 0/5</div>
      <div>Win/Loss: 0W / 0L (0.0%)</div>
    </div>
    
    <!-- Signal Analysis Section -->
    <div class="signal-section">
      <h2>Signal Analysis: {SELECTED_SYMBOL}</h2>
      <div class="signal-meter">
        <!-- Visual bar: -100 to +100 scale -->
        <!-- Color: Red (negative) → Yellow (neutral) → Green (positive) -->
        <!-- Shows current score with needle indicator -->
      </div>
      <div class="signal-label">
        Score: +72 | STRONG BUY | HIGH Confidence
      </div>
      
      <!-- Indicator Breakdown Table -->
      <table class="indicators-table">
        <tr>
          <th>Indicator</th>
          <th>Value</th>
          <th>Contribution</th>
        </tr>
        <tr>
          <td>RSI (14)</td>
          <td>28.5</td>
          <td class="positive">+25</td>
        </tr>
        <tr>
          <td>Williams %R (14)</td>
          <td>-85.2</td>
          <td class="positive">+20</td>
        </tr>
        <!-- ... all 8 indicators -->
      </table>
    </div>
    
    <!-- Order Entry Form -->
    <div class="order-form">
      <h3>Place Order</h3>
      <select id="orderSide">
        <option value="buy">LONG</option>
        <option value="sell">SHORT</option>
      </select>
      <div>Position Size: 5.0%</div>
      <div>Calculated Lots: <span id="calcLots">0.000</span></div>
      <div>
        Leverage: <span id="leverageDisplay">10x</span>
        <input type="range" id="leverageSlider" min="1" max="100" value="10">
      </div>
      <div>Entry Level: 9th Order Book Level</div>
      <div>Entry Price: <span id="entryPrice">--</span></div>
      <button id="placeOrderBtn" class="btn-primary">PLACE LIMIT ORDER</button>
    </div>
    
    <!-- Active Positions -->
    <div class="positions-panel">
      <h3>Active Positions (0/5)</h3>
      <button id="closeAllBtn" class="btn-danger">CLOSE ALL</button>
      <div class="positions-list">
        <!-- Each position shows:
             - Symbol
             - Side (LONG/SHORT)
             - Entry Price
             - Current Price
             - Size (lots)
             - Unrealized P&L ($)
             - Unrealized P&L (%)
             - Stop Loss (with indicator if break-even or trailing)
             - Take Profit
             - Close button
        -->
      </div>
    </div>
  </div>
  
  <!-- RIGHT COLUMN: Event Logger -->
  <div class="logger-panel">
    <h3>Event Log</h3>
    <button id="exportLogBtn">Export</button>
    <button id="clearLogBtn">Clear</button>
    <div class="log-container">
      <!-- Auto-scrolling log with:
           [TIMESTAMP] [TYPE] Message
           Types: INFO, SUCCESS, WARNING, ERROR
           Color-coded by type
      -->
    </div>
  </div>
</body>
</html>
```

### **WebSocket Message Protocol**

```javascript
// Client → Server Messages
{
  type: 'subscribe_symbol',
  symbol: 'XBTUSDTM'
}

{
  type: 'unsubscribe_symbol',
  symbol: 'XBTUSDTM'
}

{
  type: 'place_order',
  data: {
    symbol: 'XBTUSDTM',
    side: 'buy',
    leverage: 10
  }
}

{
  type: 'close_position',
  symbol: 'XBTUSDTM'
}

{
  type: 'close_all_positions'
}

{
  type: 'get_balance'
}

{
  type: 'get_positions'
}

// Server → Client Messages
{
  type: 'market_data',
  symbol: 'XBTUSDTM',
  data: {
    price: 95000,
    change24h: 2.5,
    volume: 1234567,
    signal: {
      score: 72,
      signalType: 'STRONG_BUY',
      confidence: 'HIGH',
      breakdown: { /* indicator contributions */ }
    },
    indicators: { /* all 8 indicators */ },
    orderBook: {
      bids: [[95000, 100], [94999, 50], ...],
      asks: [[95001, 80], [95002, 60], ...],
      entry_bid_9th: 94991,
      entry_ask_9th: 95010
    }
  }
}

{
  type: 'balance_update',
  data: {
    availableBalance: 1000.00,
    totalEquity: 1050.00,
    unrealisedPnl: 50.00
  }
}

{
  type: 'positions',
  data: [
    {
      symbol: 'XBTUSDTM',
      side: 'buy',
      size: 0.01,
      entryPrice: 95000,
      currentPrice: 95500,
      unrealisedPnl: 5.00,
      unrealisedPnlPercent: 0.53,
      stopLoss: 95000,
      takeProfit: 96900,
      breakEvenLocked: true,
      trailingActive: true,
      openTime: '2024-12-18T10:30:00Z'
    }
  ]
}

{
  type: 'position_update',
  position: { /* single position object */ }
}

{
  type: 'order_placed',
  data: {
    orderId: '64a1b2c3d4e5f6789',
    symbol: 'XBTUSDTM',
    side: 'buy',
    size: 0.01,
    price: 94991,
    status: 'pending'
  }
}

{
  type: 'order_filled',
  data: {
    orderId: '64a1b2c3d4e5f6789',
    symbol: 'XBTUSDTM',
    fillPrice: 94991,
    fillSize: 0.01,
    timestamp: '2024-12-18T10:32:15Z'
  }
}

{
  type: 'log',
  log: {
    timestamp: '2024-12-18 10:32:15',
    level: 'SUCCESS',
    message: 'Break-even locked for XBTUSDTM at $95000'
  }
}

{
  type: 'error',
  message: 'Failed to place order: Insufficient balance'
}
```

---

## 🐛 KNOWN V.3.3 BUG: LOT SIZING ISSUE

### **Bug Description**
When attempting to place orders, the system returns a 400 error from KuCoin API with message:
```
"Position size too small" or "Size does not meet minimum requirements"
```

### **Root Cause**
The lot sizing calculation in V.3.3 does not properly account for:
1. **Contract lot size multipliers** (varies by symbol)
2. **Minimum order quantity** (minOrderQty from contract specs)
3. **Lot step increments** (e.g., 0.001, 0.01, or 1.0)
4. **Price-dependent position value** (some symbols require more lots)

### **Fix Implementation**
```javascript
async function calculatePositionSize(symbol, accountEquity, positionPercent) {
  // Step 1: Get contract specifications
  const contract = await kucoinAPI.getContractDetail(symbol);
  
  // Step 2: Get current market price
  const ticker = await kucoinAPI.getTicker(symbol);
  const currentPrice = parseFloat(ticker.lastPrice);
  
  // Step 3: Calculate desired position value
  const positionValueUSD = accountEquity * (positionPercent / 100);
  
  // Step 4: Calculate required lots
  // Formula: lots = positionValue / (price × lotSize × multiplier)
  const lotSize = contract.lotSize;           // e.g., 1 for BTC
  const multiplier = contract.multiplier;     // e.g., 1 for USDT futures
  const rawLots = positionValueUSD / (currentPrice * lotSize * multiplier);
  
  // Step 5: Round to lot step
  const lotStep = contract.lotStep || 0.001;
  const roundedLots = Math.floor(rawLots / lotStep) * lotStep;
  
  // Step 6: Ensure minimum order quantity
  const finalLots = Math.max(roundedLots, contract.minOrderQty);
  
  // Step 7: Validate against maximum
  if (finalLots > contract.maxOrderQty) {
    throw new Error(`Position size ${finalLots} exceeds maximum ${contract.maxOrderQty}`);
  }
  
  // Step 8: Final validation check
  if (finalLots < contract.minOrderQty) {
    throw new Error(
      `Calculated lot size ${finalLots} below minimum ${contract.minOrderQty}. ` +
      `Increase position % or account balance.`
    );
  }
  
  return {
    lots: finalLots,
    positionValueUSD: finalLots * currentPrice * lotSize * multiplier,
    effectivePercent: (finalLots * currentPrice * lotSize * multiplier) / accountEquity * 100
  };
}
```

### **Testing Protocol**
Before placing any real order:
```javascript
console.log('=== LOT SIZE CALCULATION DEBUG ===');
console.log('Account Equity:', accountEquity);
console.log('Position %:', positionPercent);
console.log('Symbol:', symbol);
console.log('Current Price:', currentPrice);
console.log('Lot Size:', contract.lotSize);
console.log('Multiplier:', contract.multiplier);
console.log('Min Order Qty:', contract.minOrderQty);
console.log('Lot Step:', contract.lotStep);
console.log('Raw Lots Calculated:', rawLots);
console.log('Rounded Lots:', roundedLots);
console.log('Final Lots:', finalLots);
console.log('Position Value USD:', positionValueUSD);
console.log('Effective %:', effectivePercent);
console.log('===================================');
```

---

## 📚 REQUIRED NPM PACKAGES

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "ws": "^8.14.2",
    "axios": "^1.6.0",
    "crypto": "^1.0.1",
    "dotenv": "^16.3.1",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
```

---

## 🔑 ENVIRONMENT VARIABLES

```env
# KuCoin API Credentials
KUCOIN_API_KEY=your_api_key_here
KUCOIN_API_SECRET=your_api_secret_here
KUCOIN_API_PASSPHRASE=your_api_passphrase_here

# Server Configuration
PORT=3001
NODE_ENV=production

# Trading Configuration
DEFAULT_LEVERAGE=10
MAX_POSITIONS=5
MAX_SYMBOLS=10
POSITION_SIZE_PERCENT=5.0
```

---

## ✅ DEPLOYMENT CHECKLIST

1. **File Structure**
```
kucoin-futures-dashboard/
├── server.js              (1,200+ lines - complete backend)
├── public/
│   └── index.html        (1,500+ lines - complete frontend)
├── package.json
├── .env
├── .env.example
├── positions.json        (auto-created)
├── trading_stats.json    (auto-created)
├── trading.log           (auto-created)
├── start.sh             (startup script)
└── README.md
```

2. **Startup Commands**
```bash
# Install dependencies
npm install

# Test API connection (before trading)
node test-connection.js

# Start server
npm start

# Or with auto-reload for development
npm run dev
```

3. **First-Time Setup Verification**
```javascript
// Run these checks on startup
✓ Node.js version 16+ installed
✓ All npm packages installed successfully
✓ .env file exists with valid API credentials
✓ KuCoin API connection successful
✓ Account balance retrieved
✓ Contract details fetched for test symbol
✓ WebSocket server listening on port 3001
✓ Frontend accessible at http://localhost:3001
```

---

## 🎓 SUCCESS CRITERIA

Your implementation MUST pass ALL of these tests:

### **Functional Tests**
- [ ] Dashboard loads without errors
- [ ] WebSocket establishes connection
- [ ] Can add/remove symbols to watchlist
- [ ] Signal scores calculate correctly for all symbols
- [ ] All 8 indicators show proper values
- [ ] 9th order book level identified correctly
- [ ] Lot size calculated without errors
- [ ] Order placement succeeds (on demo/testnet)
- [ ] Position appears in active positions
- [ ] Break-even triggers at correct profit threshold
- [ ] Trailing stop moves forward but never backward
- [ ] Position closes when SL/TP hit
- [ ] Manual close button works
- [ ] Close all button closes all positions
- [ ] Event logger captures all events
- [ ] Log export generates valid file
- [ ] Win/loss statistics update correctly

### **Performance Tests**
- [ ] Dashboard updates every 5 seconds maximum
- [ ] Position checks occur every 2 seconds
- [ ] No memory leaks after 24 hour operation
- [ ] WebSocket reconnects automatically on disconnect
- [ ] API rate limits never exceeded
- [ ] All calculations complete within 100ms

### **Edge Case Tests**
- [ ] Handles account with $0 balance
- [ ] Handles symbol with insufficient liquidity
- [ ] Handles order rejection gracefully
- [ ] Recovers from server restart
- [ ] Persists positions through restart
- [ ] Handles simultaneous order fills
- [ ] Handles network interruption

---

## 🚨 CRITICAL REQUIREMENTS

1. **NEVER use placeholder code**
   - Every function must be fully implemented
   - No "TODO" comments
   - No "coming soon" features

2. **ALWAYS handle errors**
   - Try-catch blocks around all API calls
   - User-friendly error messages
   - Detailed error logging

3. **VALIDATE everything**
   - Check API responses are valid
   - Verify calculations before executing
   - Confirm order parameters before submission

4. **TEST before deploying**
   - Unit test all calculation functions
   - Integration test API interactions
   - End-to-end test complete trade flow

5. **DOCUMENT your code**
   - Comments explaining complex logic
   - JSDoc for all functions
   - README with setup instructions

---

## 📖 ONLINE RESOURCES FOR 99.99% ACCURACY

### **Official Documentation**
- KuCoin Futures API: https://www.kucoin.com/docs/rest/futures-trading/orders/place-order
- WebSocket Protocol: https://www.kucoin.com/docs/websocket/basic-info/connect
- Node.js Express: https://expressjs.com/
- WebSocket (ws): https://github.com/websockets/ws

### **Technical Indicator Algorithms**
- RSI: https://en.wikipedia.org/wiki/Relative_strength_index
- MACD: https://en.wikipedia.org/wiki/MACD
- Williams %R: https://en.wikipedia.org/wiki/Williams_%25R
- Bollinger Bands: https://en.wikipedia.org/wiki/Bollinger_Bands
- Stochastic Oscillator: https://en.wikipedia.org/wiki/Stochastic_oscillator

### **Trading Concepts**
- Position Sizing: https://www.investopedia.com/terms/p/positionsizing.asp
- Stop Loss: https://www.investopedia.com/terms/s/stop-lossorder.asp
- Trailing Stop: https://www.investopedia.com/terms/t/trailingstop.asp

---

END OF PROMPT 1

**This prompt provides the complete technical foundation. Use it with PROMPT 2 (Diagnostics) and PROMPT 3 (Implementation Roadmap) for 99.99% accuracy.**
