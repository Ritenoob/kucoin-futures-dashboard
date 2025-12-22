/**
 * UPDATED SIGNAL GENERATOR - CONFIGURABLE WEIGHTS
 * Replace the SignalGenerator class in server.js with this
 */

const signalConfig = require('./signal-weights.js');

class SignalGenerator {
  static generate(indicators) {
    // Get active weights profile
    const profileName = signalConfig.activeProfile;
    const weights = profileName === 'default' 
      ? signalConfig.weights 
      : signalConfig.profiles[profileName];

    if (!weights) {
      console.error(`Invalid profile: ${profileName}, using default`);
      weights = signalConfig.weights;
    }

    let score = 0;
    const breakdown = [];

    // ========================================================================
    // RSI (Relative Strength Index)
    // ========================================================================
    const rsiConfig = weights.rsi;
    if (indicators.rsi < rsiConfig.oversold) {
      score += rsiConfig.max;
      breakdown.push({ 
        indicator: 'RSI', 
        value: indicators.rsi.toFixed(1), 
        contribution: rsiConfig.max, 
        reason: `Oversold (<${rsiConfig.oversold})`, 
        type: 'bullish' 
      });
    } else if (indicators.rsi < rsiConfig.oversoldMild) {
      const points = Math.round(rsiConfig.max * 0.6);
      score += points;
      breakdown.push({ 
        indicator: 'RSI', 
        value: indicators.rsi.toFixed(1), 
        contribution: points, 
        reason: 'Approaching oversold', 
        type: 'bullish' 
      });
    } else if (indicators.rsi > rsiConfig.overbought) {
      score -= rsiConfig.max;
      breakdown.push({ 
        indicator: 'RSI', 
        value: indicators.rsi.toFixed(1), 
        contribution: -rsiConfig.max, 
        reason: `Overbought (>${rsiConfig.overbought})`, 
        type: 'bearish' 
      });
    } else if (indicators.rsi > rsiConfig.overboughtMild) {
      const points = Math.round(rsiConfig.max * 0.6);
      score -= points;
      breakdown.push({ 
        indicator: 'RSI', 
        value: indicators.rsi.toFixed(1), 
        contribution: -points, 
        reason: 'Approaching overbought', 
        type: 'bearish' 
      });
    } else {
      breakdown.push({ 
        indicator: 'RSI', 
        value: indicators.rsi.toFixed(1), 
        contribution: 0, 
        reason: `Neutral (${rsiConfig.oversoldMild}-${rsiConfig.overboughtMild})`, 
        type: 'neutral' 
      });
    }

    // ========================================================================
    // Williams %R
    // ========================================================================
    const willConfig = weights.williamsR;
    if (indicators.williamsR < willConfig.oversold) {
      score += willConfig.max;
      breakdown.push({ 
        indicator: 'Williams %R', 
        value: indicators.williamsR.toFixed(1), 
        contribution: willConfig.max, 
        reason: `Oversold (<${willConfig.oversold})`, 
        type: 'bullish' 
      });
    } else if (indicators.williamsR > willConfig.overbought) {
      score -= willConfig.max;
      breakdown.push({ 
        indicator: 'Williams %R', 
        value: indicators.williamsR.toFixed(1), 
        contribution: -willConfig.max, 
        reason: `Overbought (>${willConfig.overbought})`, 
        type: 'bearish' 
      });
    } else {
      breakdown.push({ 
        indicator: 'Williams %R', 
        value: indicators.williamsR.toFixed(1), 
        contribution: 0, 
        reason: 'Neutral', 
        type: 'neutral' 
      });
    }

    // ========================================================================
    // MACD
    // ========================================================================
    const macdConfig = weights.macd;
    if (indicators.macd > 0 && indicators.macdHistogram > 0) {
      score += macdConfig.max;
      breakdown.push({ 
        indicator: 'MACD', 
        value: indicators.macd.toFixed(2), 
        contribution: macdConfig.max, 
        reason: 'Bullish momentum', 
        type: 'bullish' 
      });
    } else if (indicators.macd < 0 && indicators.macdHistogram < 0) {
      score -= macdConfig.max;
      breakdown.push({ 
        indicator: 'MACD', 
        value: indicators.macd.toFixed(2), 
        contribution: -macdConfig.max, 
        reason: 'Bearish momentum', 
        type: 'bearish' 
      });
    } else {
      breakdown.push({ 
        indicator: 'MACD', 
        value: indicators.macd.toFixed(2), 
        contribution: 0, 
        reason: 'Neutral/Crossover', 
        type: 'neutral' 
      });
    }

    // ========================================================================
    // Awesome Oscillator
    // ========================================================================
    const aoConfig = weights.ao;
    if (indicators.ao > 0) {
      score += aoConfig.max;
      breakdown.push({ 
        indicator: 'AO', 
        value: indicators.ao.toFixed(2), 
        contribution: aoConfig.max, 
        reason: 'Positive momentum', 
        type: 'bullish' 
      });
    } else {
      score -= aoConfig.max;
      breakdown.push({ 
        indicator: 'AO', 
        value: indicators.ao.toFixed(2), 
        contribution: -aoConfig.max, 
        reason: 'Negative momentum', 
        type: 'bearish' 
      });
    }

    // ========================================================================
    // EMA Trend
    // ========================================================================
    const emaConfig = weights.emaTrend;
    if (indicators.ema50 > indicators.ema200) {
      score += emaConfig.max;
      breakdown.push({ 
        indicator: 'EMA Trend', 
        value: 'EMA50 > EMA200', 
        contribution: emaConfig.max, 
        reason: 'Bullish trend (Golden Cross)', 
        type: 'bullish' 
      });
    } else if (indicators.ema50 < indicators.ema200) {
      score -= emaConfig.max;
      breakdown.push({ 
        indicator: 'EMA Trend', 
        value: 'EMA50 < EMA200', 
        contribution: -emaConfig.max, 
        reason: 'Bearish trend (Death Cross)', 
        type: 'bearish' 
      });
    } else {
      breakdown.push({ 
        indicator: 'EMA Trend', 
        value: 'EMA50 ≈ EMA200', 
        contribution: 0, 
        reason: 'Neutral', 
        type: 'neutral' 
      });
    }

    // ========================================================================
    // Stochastic
    // ========================================================================
    const stochConfig = weights.stochastic;
    if (indicators.stochK < stochConfig.oversold && indicators.stochK > indicators.stochD) {
      score += stochConfig.max;
      breakdown.push({ 
        indicator: 'Stochastic', 
        value: indicators.stochK.toFixed(1), 
        contribution: stochConfig.max, 
        reason: 'Oversold + bullish crossover', 
        type: 'bullish' 
      });
    } else if (indicators.stochK > stochConfig.overbought && indicators.stochK < indicators.stochD) {
      score -= stochConfig.max;
      breakdown.push({ 
        indicator: 'Stochastic', 
        value: indicators.stochK.toFixed(1), 
        contribution: -stochConfig.max, 
        reason: 'Overbought + bearish crossover', 
        type: 'bearish' 
      });
    } else {
      breakdown.push({ 
        indicator: 'Stochastic', 
        value: indicators.stochK.toFixed(1), 
        contribution: 0, 
        reason: 'Neutral', 
        type: 'neutral' 
      });
    }

    // ========================================================================
    // Bollinger Bands
    // ========================================================================
    const bbConfig = weights.bollinger;
    if (indicators.price < indicators.bollingerLower) {
      score += bbConfig.max;
      breakdown.push({ 
        indicator: 'Bollinger', 
        value: 'Below lower', 
        contribution: bbConfig.max, 
        reason: 'Price below lower band', 
        type: 'bullish' 
      });
    } else if (indicators.price > indicators.bollingerUpper) {
      score -= bbConfig.max;
      breakdown.push({ 
        indicator: 'Bollinger', 
        value: 'Above upper', 
        contribution: -bbConfig.max, 
        reason: 'Price above upper band', 
        type: 'bearish' 
      });
    } else {
      breakdown.push({ 
        indicator: 'Bollinger', 
        value: 'Within bands', 
        contribution: 0, 
        reason: 'Price within bands', 
        type: 'neutral' 
      });
    }

    // ========================================================================
    // Determine signal type using configurable thresholds
    // ========================================================================
    const thresholds = signalConfig.thresholds;
    let type = 'NEUTRAL';
    let confidence = 'LOW';
    
    if (score >= thresholds.strongBuy) { 
      type = 'STRONG_BUY'; 
      confidence = 'HIGH'; 
    } else if (score >= thresholds.buy) { 
      type = 'BUY'; 
      confidence = 'MEDIUM'; 
    } else if (score >= thresholds.buyWeak) { 
      type = 'BUY'; 
      confidence = 'LOW'; 
    } else if (score <= thresholds.strongSell) { 
      type = 'STRONG_SELL'; 
      confidence = 'HIGH'; 
    } else if (score <= thresholds.sell) { 
      type = 'SELL'; 
      confidence = 'MEDIUM'; 
    } else if (score <= thresholds.sellWeak) { 
      type = 'SELL'; 
      confidence = 'LOW'; 
    }

    return {
      type,
      score,
      confidence,
      breakdown,
      timestamp: Date.now(),
      profile: profileName  // Show which profile was used
    };
  }

  // Get current weight configuration summary
  static getWeightsSummary() {
    const profileName = signalConfig.activeProfile;
    const weights = profileName === 'default' 
      ? signalConfig.weights 
      : signalConfig.profiles[profileName];

    return {
      profile: profileName,
      weights: {
        RSI: weights.rsi.max,
        'Williams %R': weights.williamsR.max,
        MACD: weights.macd.max,
        AO: weights.ao.max,
        'EMA Trend': weights.emaTrend.max,
        Stochastic: weights.stochastic.max,
        'Bollinger Bands': weights.bollinger.max
      },
      total: Object.values(weights).reduce((sum, w) => sum + (w.max || 0), 0),
      thresholds: signalConfig.thresholds
    };
  }
}

// Export for use in server.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SignalGenerator;
}
