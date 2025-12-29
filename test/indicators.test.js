const assert = require('assert');

// Import the modules to test
const { TechnicalIndicators, SignalGenerator, CONFIG } = require('../server.js');

describe('TechnicalIndicators', function() {
  describe('calculateSMA', function() {
    it('should return null for insufficient data', function() {
      const result = TechnicalIndicators.calculateSMA([1, 2, 3], 5);
      assert.strictEqual(result, null);
    });

    it('should calculate SMA correctly', function() {
      const data = [10, 20, 30, 40, 50];
      const result = TechnicalIndicators.calculateSMA(data, 5);
      assert.strictEqual(result, 30);
    });

    it('should use only last N values', function() {
      const data = [100, 10, 20, 30, 40, 50];
      const result = TechnicalIndicators.calculateSMA(data, 5);
      assert.strictEqual(result, 30);
    });
  });

  describe('calculateEMA', function() {
    it('should return null for insufficient data', function() {
      const result = TechnicalIndicators.calculateEMA([1, 2], 5);
      assert.strictEqual(result, null);
    });

    it('should calculate EMA correctly', function() {
      const data = [22, 24, 23, 25, 26, 28, 27, 29, 30, 28];
      const result = TechnicalIndicators.calculateEMA(data, 5);
      assert.ok(typeof result === 'number');
      assert.ok(result > 0);
    });
  });

  describe('calculateRSI', function() {
    it('should return 50 for insufficient data', function() {
      const result = TechnicalIndicators.calculateRSI([1, 2, 3], 14);
      assert.strictEqual(result, 50);
    });

    it('should return 100 when no losses', function() {
      const data = Array.from({ length: 20 }, (_, i) => i + 1);
      const result = TechnicalIndicators.calculateRSI(data, 14);
      assert.strictEqual(result, 100);
    });

    it('should return value between 0 and 100', function() {
      const data = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 
                    46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41];
      const result = TechnicalIndicators.calculateRSI(data, 14);
      assert.ok(result >= 0 && result <= 100);
    });
  });

  describe('calculateWilliamsR', function() {
    it('should return -50 for insufficient data', function() {
      const result = TechnicalIndicators.calculateWilliamsR([1], [1], [1], 14);
      assert.strictEqual(result, -50);
    });

    it('should return value between -100 and 0', function() {
      const highs = [48, 49, 50, 51, 52, 51, 50, 49, 48, 47, 48, 49, 50, 51, 52];
      const lows = [45, 46, 47, 48, 49, 48, 47, 46, 45, 44, 45, 46, 47, 48, 49];
      const closes = [47, 48, 49, 50, 51, 50, 49, 48, 47, 46, 47, 48, 49, 50, 51];
      const result = TechnicalIndicators.calculateWilliamsR(highs, lows, closes, 14);
      assert.ok(result >= -100 && result <= 0);
    });
  });

  describe('calculateATR', function() {
    it('should return 0 for insufficient data', function() {
      const result = TechnicalIndicators.calculateATR([1], [1], [1], 14);
      assert.strictEqual(result, 0);
    });

    it('should return positive value for valid data', function() {
      const highs = Array.from({ length: 20 }, () => 105);
      const lows = Array.from({ length: 20 }, () => 95);
      const closes = Array.from({ length: 20 }, () => 100);
      const result = TechnicalIndicators.calculateATR(highs, lows, closes, 14);
      assert.ok(result >= 0);
    });
  });

  describe('calculateMACD', function() {
    it('should return zeros for insufficient data', function() {
      const result = TechnicalIndicators.calculateMACD([1, 2, 3], 12, 26);
      assert.deepStrictEqual(result, { macd: 0, signal: 0, histogram: 0 });
    });

    it('should return object with macd, signal, histogram', function() {
      const data = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 10);
      const result = TechnicalIndicators.calculateMACD(data, 12, 26);
      assert.ok('macd' in result);
      assert.ok('signal' in result);
      assert.ok('histogram' in result);
    });
  });

  describe('calculateBollingerBands', function() {
    it('should return current price for insufficient data', function() {
      const result = TechnicalIndicators.calculateBollingerBands([100], 20, 2);
      assert.strictEqual(result.upper, 100);
      assert.strictEqual(result.middle, 100);
      assert.strictEqual(result.lower, 100);
    });

    it('should return upper > middle > lower', function() {
      const data = Array.from({ length: 25 }, () => 100 + Math.random() * 10);
      const result = TechnicalIndicators.calculateBollingerBands(data, 20, 2);
      assert.ok(result.upper >= result.middle);
      assert.ok(result.middle >= result.lower);
    });
  });

  describe('calculateStochastic', function() {
    it('should return 50 for insufficient data', function() {
      const result = TechnicalIndicators.calculateStochastic([1], [1], [1], 14);
      assert.deepStrictEqual(result, { k: 50, d: 50 });
    });

    it('should return k between 0 and 100', function() {
      const highs = Array.from({ length: 20 }, (_, i) => 110 - i * 0.5);
      const lows = Array.from({ length: 20 }, (_, i) => 90 + i * 0.3);
      const closes = Array.from({ length: 20 }, (_, i) => 100);
      const result = TechnicalIndicators.calculateStochastic(highs, lows, closes, 14);
      assert.ok(result.k >= 0 && result.k <= 100);
    });
  });
});

describe('SignalGenerator', function() {
  describe('generate', function() {
    it('should return STRONG_BUY for very bullish indicators', function() {
      const indicators = {
        rsi: 25, williamsR: -85, macd: 10, macdHistogram: 5,
        ao: 15, ema50: 110, ema200: 100
      };
      const result = SignalGenerator.generate(indicators);
      assert.strictEqual(result.type, 'STRONG_BUY');
      assert.strictEqual(result.confidence, 'HIGH');
      assert.ok(result.score >= 70);
    });

    it('should return STRONG_SELL for very bearish indicators', function() {
      const indicators = {
        rsi: 75, williamsR: -15, macd: -10, macdHistogram: -5,
        ao: -15, ema50: 90, ema200: 100
      };
      const result = SignalGenerator.generate(indicators);
      assert.strictEqual(result.type, 'STRONG_SELL');
      assert.strictEqual(result.confidence, 'HIGH');
      assert.ok(result.score <= -70);
    });

    it('should return NEUTRAL for mixed indicators', function() {
      const indicators = {
        rsi: 50, williamsR: -50, macd: 0, macdHistogram: 0,
        ao: 5, ema50: 100, ema200: 100
      };
      const result = SignalGenerator.generate(indicators);
      assert.ok(result.score >= -29 && result.score <= 29);
    });

    it('should include breakdown array', function() {
      const indicators = {
        rsi: 50, williamsR: -50, macd: 0, macdHistogram: 0,
        ao: 5, ema50: 100, ema200: 100
      };
      const result = SignalGenerator.generate(indicators);
      assert.ok(Array.isArray(result.breakdown));
      assert.ok(result.breakdown.length > 0);
    });

    it('should include timestamp', function() {
      const indicators = {
        rsi: 50, williamsR: -50, macd: 0, macdHistogram: 0,
        ao: 5, ema50: 100, ema200: 100
      };
      const result = SignalGenerator.generate(indicators);
      assert.ok(typeof result.timestamp === 'number');
    });
  });
});

describe('CONFIG', function() {
  it('should have trading parameters', function() {
    assert.ok(CONFIG.TRADING);
    assert.strictEqual(CONFIG.TRADING.INITIAL_SL_PERCENT, 0.5);
    assert.strictEqual(CONFIG.TRADING.INITIAL_TP_PERCENT, 2.0);
    assert.strictEqual(CONFIG.TRADING.DEFAULT_LEVERAGE, 10);
    assert.strictEqual(CONFIG.TRADING.MAX_POSITIONS, 5);
  });

  it('should have default symbols', function() {
    assert.ok(Array.isArray(CONFIG.DEFAULT_SYMBOLS));
    assert.ok(CONFIG.DEFAULT_SYMBOLS.includes('XBTUSDTM'));
  });

  it('should have timeframes', function() {
    assert.ok(CONFIG.TIMEFRAMES);
    assert.strictEqual(CONFIG.TIMEFRAMES['5min'], 5);
    assert.strictEqual(CONFIG.TIMEFRAMES['1hour'], 60);
  });
});
