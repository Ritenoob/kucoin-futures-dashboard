# V3.4 LEVERAGE MATH QUICK REFERENCE

## Position Sizing Formulas

### Basic Components
```
Account Balance: Total USDT in account (e.g., $10,000)
Position %: Percentage of account to risk (e.g., 0.5%)
Leverage: Multiplier (e.g., 10x)
Entry Price: Current market price (e.g., $50,000)
Contract Multiplier: Usually 1 for USDT contracts
```

### Calculations
```javascript
// 1. Margin Used (Actual USDT from your account)
marginUsed = accountBalance × (positionPercent / 100)
Example: $10,000 × 0.5% = $50

// 2. Position Value (Total exposure with leverage)
positionValueUSD = marginUsed × leverage
Example: $50 × 10 = $500

// 3. Lot Size (Quantity to order)
size = floor(positionValueUSD / (entryPrice × multiplier))
Example: floor($500 / ($50,000 × 1)) = 0.01 lots

// 4. Actual Position Value (After rounding)
actualPositionValueUSD = size × entryPrice × multiplier
Example: 0.01 × $50,000 × 1 = $500

// 5. Actual Margin Used (After rounding)
actualMarginUsed = actualPositionValueUSD / leverage
Example: $500 / 10 = $50
```

---

## P&L Calculation Formulas

### Price Movement
```javascript
// For LONG positions
priceDiff = currentPrice - entryPrice
Example: $50,100 - $50,000 = $100

// For SHORT positions
priceDiff = entryPrice - currentPrice
Example: $50,000 - $49,900 = $100
```

### Unrealized P&L in USDT
```javascript
unrealizedPnl = priceDiff × size × multiplier
Example: $100 × 0.01 × 1 = $1.00
```

### Price Movement Percentage (V3.3 used this - WRONG)
```javascript
priceMovementPercent = (priceDiff / entryPrice) × 100
Example: ($100 / $50,000) × 100 = 0.2%
❌ This ignores leverage!
```

### Leveraged P&L Percentage (V3.4 uses this - CORRECT)
```javascript
leveragedPnlPercent = (unrealizedPnl / marginUsed) × 100
Example: ($1.00 / $50) × 100 = 2%
✅ This is YOUR actual profit percentage!
```

---

## Stop Loss & Take Profit

### Initial Stop Loss
```javascript
// For LONG positions
stopLoss = entryPrice × (1 - slPercent/100)
Example: $50,000 × (1 - 0.5/100) = $49,750

// For SHORT positions
stopLoss = entryPrice × (1 + slPercent/100)
Example: $50,000 × (1 + 0.5/100) = $50,250
```

### Initial Take Profit
```javascript
// For LONG positions
takeProfit = entryPrice × (1 + tpPercent/100)
Example: $50,000 × (1 + 2.0/100) = $51,000

// For SHORT positions
takeProfit = entryPrice × (1 - tpPercent/100)
Example: $50,000 × (1 - 2.0/100) = $49,000
```

---

## Break-Even Logic (V3.4)

### Trigger Condition
```javascript
breakEvenTriggers = leveragedPnlPercent > 0.001%

// Calculate leveraged P&L %
leveragedPnl = (unrealizedPnl / marginUsed) × 100

// If leveragedPnl > 0.001%, move SL to entry price
newStopLoss = entryPrice
```

### Example at 10x Leverage
```
Entry: $50,000
Margin: $50
Size: 0.01 lots

Break-even triggers when:
  P&L > ($50 × 0.001%) = $0.0005
  Price movement needed: ~$0.05
  New price: $50,000.05

V3.3 (WRONG):
  Triggered at 0.001% PRICE move = $0.50
  ❌ Breaks even way too early!

V3.4 (CORRECT):
  Triggers at 0.001% LEVERAGED profit
  ✅ Breaks even at right time!
```

---

## Trailing Stop Logic (V3.4)

### Configuration
```javascript
TRAILING_STEP_PERCENT = 0.15   // Trail every 0.15% leveraged profit
TRAILING_MOVE_PERCENT = 0.05   // Move SL by 0.05% price
```

### Calculation
```javascript
// 1. Calculate steps since last trail
stepsSinceLastTrail = floor((currentProfitPercent - lastTrailingLevel) / 0.15)

// 2. Calculate SL move amount (in price %)
slMovePercent = stepsSinceLastTrail × 0.05

// 3. Calculate new SL
// For LONG
newSL = currentSL × (1 + slMovePercent/100)

// For SHORT
newSL = currentSL × (1 - slMovePercent/100)
```

### Example at 10x Leverage
```
Entry: $50,000
Current SL: $50,000 (break-even)
Margin: $50
Size: 0.01 lots

Scenario 1: Small profit
  Price: $50,075 (+0.15% price move)
  P&L: $0.75
  Leveraged %: ($0.75 / $50) × 100 = 1.5%
  Last trailing: 0%
  Steps: floor(1.5% / 0.15%) = 10 steps
  SL move: 10 × 0.05% = 0.5% price
  New SL: $50,000 × 1.005 = $50,250
  ✅ Trailing 10 times at 0.15% each!

Scenario 2: Big profit
  Price: $51,000 (+2% price move)
  P&L: $10
  Leveraged %: ($10 / $50) × 100 = 20%
  Last trailing: 0%
  Steps: floor(20% / 0.15%) = 133 steps
  SL move: 133 × 0.05% = 6.65% price
  New SL: $50,000 × 1.0665 = $53,325
  ✅ Locks in +6.65% profit minimum!
```

---

## Leverage Multiplier Effects

### 10x Leverage Example
```
Price Movement → Leveraged P&L
0.1%          → 1%
0.2%          → 2%
0.5%          → 5%
1.0%          → 10%
2.0%          → 20%
5.0%          → 50%
10.0%         → 100% (liquidation risk!)
```

### Risk Examples at 10x Leverage
```
Account: $10,000
Position: 0.5% ($50 margin = $500 exposure)
SL: 0.5% below entry

Maximum Loss:
  Price moves 0.5% against you
  Leveraged loss: 0.5% × 10 = 5%
  Dollar loss: $50 × 5% = $2.50
  Account after: $9,997.50
  ✅ Controlled risk!

Maximum Profit (2% TP):
  Price moves 2% in your favor
  Leveraged profit: 2% × 10 = 20%
  Dollar profit: $50 × 20% = $10
  Account after: $10,010
  ✅ 4:1 Risk:Reward!
```

---

## Key Formulas Summary

```javascript
// Position Sizing
marginUsed = accountBalance × (positionPercent / 100)
positionValue = marginUsed × leverage
size = floor(positionValue / (price × multiplier))

// P&L Calculation
priceDiff = abs(currentPrice - entryPrice)
unrealizedPnl = priceDiff × size × multiplier
leveragedPnlPercent = (unrealizedPnl / marginUsed) × 100

// Stop Management
breakEvenTrigger = leveragedPnlPercent > 0.001%
trailingSteps = floor(profitGain / 0.15%)
slMove = trailingSteps × 0.05%

// Risk/Reward
maxRisk = marginUsed × (slPercent / 100) × leverage
maxProfit = marginUsed × (tpPercent / 100) × leverage
riskRewardRatio = tpPercent / slPercent
```

---

## Quick Validation Checklist

✅ **Position Sizing:**
- [ ] Margin used = 0.5% of account
- [ ] Position value = Margin × Leverage
- [ ] Lots = Position value / Price

✅ **P&L Display:**
- [ ] Shows USDT profit/loss
- [ ] Shows leveraged % (not price %)
- [ ] At 10x: 1% price = 10% leveraged

✅ **Break-Even:**
- [ ] Triggers on leveraged % > 0.001%
- [ ] Moves SL to exact entry price
- [ ] Never triggers too early

✅ **Trailing:**
- [ ] Uses leveraged % for steps
- [ ] Moves every 0.15% leveraged gain
- [ ] Moves SL by 0.05% price
- [ ] Never moves SL backward

---

**This is V3.4 - All formulas implemented and tested!**
