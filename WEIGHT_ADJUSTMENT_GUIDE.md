# 🎯 SIGNAL WEIGHT ADJUSTMENT GUIDE

## 📊 UNDERSTANDING SIGNAL WEIGHTS

Your signal generator uses 8 technical indicators. Each indicator contributes points to a final score (-100 to +100). The **weights** determine how many points each indicator can contribute.

### Current Default Weights (v3.4.2):

```
RSI:              25 points (±25)
Williams %R:      20 points (±20)
MACD:             20 points (±20)
Awesome Osc:      15 points (±15)
EMA Trend:        20 points (±20)
Stochastic:       10 points (±10)
Bollinger Bands:  10 points (±10)
────────────────────────────
TOTAL:           120 points
```

**Score ranges:** -120 (max bearish) to +120 (max bullish)

---

## 🎮 QUICK START - ADJUSTING WEIGHTS

### Method 1: Interactive Tool (RECOMMENDED)

```bash
node adjust-weights.js
```

**Features:**
- ✅ Switch between preset profiles
- ✅ Adjust individual indicator weights
- ✅ Modify signal thresholds
- ✅ Create custom profiles
- ✅ Test with sample data
- ✅ Save changes

### Method 2: Edit Config File

```bash
nano signal-weights.js
```

**Find this section:**
```javascript
weights: {
  rsi: {
    max: 25,  // ← Change this
    // ...
  },
  // ...
}
```

**Change `max` values**, save, restart server.

### Method 3: Switch Profiles

**Edit signal-weights.js:**
```javascript
activeProfile: 'aggressive',  // Options: 'default', 'conservative', 'aggressive', 'balanced', 'scalping', 'swingTrading'
```

---

## 📋 PRESET PROFILES

### 1. **Default** (Original v3.4.2)
```
RSI: 25, Williams: 20, MACD: 20, AO: 15, EMA: 20, Stoch: 10, BB: 10
Total: 120 points
```
**Best for:** General trading, balanced approach

### 2. **Conservative** (Trend-focused)
```
RSI: 15, Williams: 10, MACD: 25, AO: 10, EMA: 30, Stoch: 5, BB: 5
Total: 100 points
```
**Best for:** Swing trading, following trends
**Why:** EMA Trend (30) and MACD (25) have highest weights

### 3. **Aggressive** (Momentum-focused)
```
RSI: 30, Williams: 25, MACD: 15, AO: 20, EMA: 10, Stoch: 15, BB: 5
Total: 120 points
```
**Best for:** Day trading, catching reversals
**Why:** RSI (30) and Williams (25) dominate

### 4. **Balanced**
```
RSI: 20, Williams: 15, MACD: 15, AO: 15, EMA: 15, Stoch: 10, BB: 10
Total: 100 points
```
**Best for:** Moderate risk, diversified signals
**Why:** Equal-ish distribution

### 5. **Scalping** (Quick signals)
```
RSI: 20, Williams: 25, MACD: 10, AO: 20, EMA: 5, Stoch: 15, BB: 5
Total: 100 points
```
**Best for:** Very short-term trades (minutes)
**Why:** Fast oscillators (Williams, AO) prioritized, trend ignored

### 6. **Swing Trading** (Position trading)
```
RSI: 20, Williams: 15, MACD: 30, AO: 15, EMA: 25, Stoch: 5, BB: 10
Total: 120 points
```
**Best for:** Multi-day holds
**Why:** MACD (30) and EMA (25) for trend confirmation

---

## 🎯 WHEN TO ADJUST WEIGHTS

### Increase Weight If:
- ✅ Indicator consistently predicts good signals
- ✅ You trust it more than others
- ✅ It has low false positives
- ✅ Works well for your trading style

### Decrease Weight If:
- ❌ Indicator gives too many false signals
- ❌ Lags too much (like slow EMAs in scalping)
- ❌ Not relevant to your timeframe
- ❌ Already captured by another indicator

---

## 📊 INDICATOR CHARACTERISTICS

### **RSI** (Momentum Oscillator)
- **Range:** 0-100
- **Signals:** <30 oversold (buy), >70 overbought (sell)
- **Best for:** Identifying reversals
- **Lag:** Medium
- **Increase weight if:** You're catching reversals
- **Decrease weight if:** You follow trends

### **Williams %R** (Momentum Oscillator)
- **Range:** -100 to 0
- **Signals:** <-80 oversold, >-20 overbought
- **Best for:** Similar to RSI, more sensitive
- **Lag:** Low
- **Increase weight if:** Scalping or day trading
- **Decrease weight if:** Too many whipsaws

### **MACD** (Trend Follower)
- **Range:** Unlimited
- **Signals:** Positive = bullish, negative = bearish
- **Best for:** Trend confirmation
- **Lag:** High
- **Increase weight if:** Swing trading or trends
- **Decrease weight if:** Scalping or choppy markets

### **Awesome Oscillator** (Momentum)
- **Range:** Unlimited
- **Signals:** >0 bullish, <0 bearish
- **Best for:** Momentum shifts
- **Lag:** Medium
- **Increase weight if:** Quick momentum changes important
- **Decrease weight if:** Too volatile

### **EMA Trend** (Trend Direction)
- **Range:** Golden Cross (EMA50 > EMA200) or Death Cross
- **Signals:** Binary (bullish or bearish trend)
- **Best for:** Long-term direction
- **Lag:** Very high
- **Increase weight if:** Position trading
- **Decrease weight if:** Scalping

### **Stochastic** (Momentum + Crossovers)
- **Range:** 0-100
- **Signals:** <20 oversold, >80 overbought, plus crossovers
- **Best for:** Reversal + confirmation
- **Lag:** Medium
- **Increase weight if:** Want dual confirmation
- **Decrease weight if:** Redundant with RSI

### **Bollinger Bands** (Volatility)
- **Range:** Price vs. upper/lower bands
- **Signals:** Outside bands = potential reversal
- **Best for:** Overbought/oversold in trending markets
- **Lag:** Medium
- **Increase weight if:** Mean reversion strategy
- **Decrease weight if:** Trend following

---

## 🧪 TESTING YOUR WEIGHTS

### Step 1: Make Changes
```bash
node adjust-weights.js
# Or edit signal-weights.js
```

### Step 2: Test With Tool
```bash
node adjust-weights.js
# Select option 5: "Test with sample data"
```

**Shows:**
- Bullish scenario score
- Bearish scenario score
- Breakdown of contributions

### Step 3: Paper Trade
```bash
npm start
# Watch signals for 1-2 days
# Track which signals would have been profitable
```

### Step 4: Optimize
**Adjust based on results:**
- If too many false STRONG_BUY → Increase threshold or reduce weights
- If missing good signals → Lower threshold or increase weights
- If one indicator always wrong → Decrease its weight

---

## 📈 EXAMPLE OPTIMIZATION

### Scenario: Too Many False Signals

**Problem:**
```
Getting STRONG_BUY at score 70+
But 60% of them fail
```

**Solutions:**

**Option A: Raise Threshold**
```javascript
thresholds: {
  strongBuy: 85,  // Was 70, now 85
  // ...
}
```
**Result:** Fewer but stronger signals

**Option B: Reduce Noisy Indicators**
```javascript
// If RSI gives most false signals:
rsi: {
  max: 15,  // Was 25
  // ...
}
```
**Result:** RSI contributes less to total

### Scenario: Missing Good Opportunities

**Problem:**
```
Market clearly oversold
But signal only shows BUY (score 55)
Should be STRONG_BUY
```

**Solutions:**

**Option A: Lower Threshold**
```javascript
thresholds: {
  strongBuy: 60,  // Was 70
  // ...
}
```

**Option B: Increase Relevant Indicators**
```javascript
// If using oversold conditions heavily:
rsi: {
  max: 30,  // Was 25
  // ...
},
williamsR: {
  max: 25,  // Was 20
  // ...
}
```

---

## 🎯 RECOMMENDED WORKFLOWS

### For Day Trading:
```javascript
activeProfile: 'aggressive'

// Fine-tune:
weights: {
  rsi: { max: 30 },           // High - catch reversals
  williamsR: { max: 25 },     // High - confirm RSI
  macd: { max: 10 },          // Low - too slow
  ao: { max: 20 },            // Medium - good momentum
  emaTrend: { max: 5 },       // Very low - irrelevant
  stochastic: { max: 15 },    // Medium - crossovers
  bollinger: { max: 15 }      // Medium - volatility matters
}
```

### For Swing Trading:
```javascript
activeProfile: 'swingTrading'

// Fine-tune:
weights: {
  rsi: { max: 15 },           // Low - less important
  williamsR: { max: 10 },     // Low - too fast
  macd: { max: 35 },          // Very high - trend critical
  ao: { max: 10 },            // Low - momentum less important
  emaTrend: { max: 30 },      // Very high - trend direction key
  stochastic: { max: 5 },     // Very low - noise
  bollinger: { max: 10 }      // Low - less relevant
}
```

### For 10x Leverage Scalping:
```javascript
activeProfile: 'scalping'

// Tight thresholds:
thresholds: {
  strongBuy: 80,    // Very high bar
  buy: 60,
  // ...
}

// Fast indicators only:
weights: {
  rsi: { max: 25, oversold: 35, overbought: 65 },  // Tighter levels
  williamsR: { max: 30 },      // Highest - fastest
  macd: { max: 5 },            // Minimal
  ao: { max: 25 },             // High - quick momentum
  emaTrend: { max: 0 },        // Zero - ignore trend
  stochastic: { max: 15 },     // Medium
  bollinger: { max: 0 }        // Zero - not helpful
}
```

---

## 🚨 IMPORTANT NOTES

### Always Restart Server
**After changing weights:**
```bash
# Stop server (Ctrl+C)
npm start
```

**Weights load at startup only!**

### Backup Before Changing
```bash
cp signal-weights.js signal-weights.backup.js
```

### Track Your Changes
**Keep a log:**
```
Date: 2025-12-22
Change: Increased RSI to 30, reduced EMA to 10
Reason: Too many false trend signals
Result: (test for 24 hours)
```

### Start Conservative
**Don't make drastic changes:**
- ❌ Don't change all weights at once
- ❌ Don't set weights to extremes (0 or 100)
- ✅ Change 1-2 indicators at a time
- ✅ Test for 24-48 hours
- ✅ Keep backup of working config

---

## 🎮 QUICK REFERENCE

**Switch profile:**
```javascript
activeProfile: 'aggressive'  // In signal-weights.js
```

**Adjust single indicator:**
```javascript
rsi: {
  max: 30,  // Change this number
  // ...
}
```

**Change threshold:**
```javascript
thresholds: {
  strongBuy: 80,  // Raise for fewer signals
  // ...
}
```

**Test immediately:**
```bash
node adjust-weights.js
# Option 5: Test with sample data
```

---

**Optimize your signals, maximize your profits!** 📈
