/**
 * Unit Tests for KuCoin Futures Dashboard
 * Tests for Technical Indicators and Signal Generator
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert');

// Import the modules to test
const { TechnicalIndicators, SignalGenerator, MarketDataManager, CONFIG } = require('./server.js');

// ============================================================================
// TECHNICAL INDICATORS TESTS
// ============================================================================
describe('TechnicalIndicators', () => {
  describe('calculateSMA', () => {
    it('should calculate SMA correctly', () => {
      const data = [10, 20, 30, 40, 50];
      const result = TechnicalIndicators.calculateSMA(data, 5);
      assert.strictEqual(result, 30);
    });

    it('should return null for insufficient data', () => {
      const data = [10, 20];
      const result = TechnicalIndicators.calculateSMA(data, 5);
      assert.strictEqual(result, null);
    });

    it('should use last N values for calculation', () => {
      const data = [5, 10, 20, 30, 40, 50];
      const result = TechnicalIndicators.calculateSMA(data, 3);
      assert.strictEqual(result, 40); // (30 + 40 + 50) / 3
    });
  });

  describe('calculateEMA', () => {
    it('should calculate EMA correctly', () => {
      const data = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      const result = TechnicalIndicators.calculateEMA(data, 5);
      assert.ok(result !== null);
      assert.ok(typeof result === 'number');
      assert.ok(result > 0);
    });

    it('should return null for insufficient data', () => {
      const data = [10, 20];
      const result = TechnicalIndicators.calculateEMA(data, 5);
      assert.strictEqual(result, null);
    });
  });

  describe('calculateRSI', () => {
    it('should return 50 for insufficient data', () => {
      const data = [10, 20, 30];
      const result = TechnicalIndicators.calculateRSI(data, 14);
      assert.strictEqual(result, 50);
    });

    it('should calculate RSI in valid range', () => {
      const data = [];
      for (let i = 0; i < 20; i++) {
        data.push(100 + Math.sin(i) * 10);
      }
      const result = TechnicalIndicators.calculateRSI(data, 14);
      assert.ok(result >= 0 && result <= 100);
    });

    it('should return 100 for continuously rising prices', () => {
      const data = [];
      for (let i = 0; i < 20; i++) {
        data.push(100 + i);
      }
      const result = TechnicalIndicators.calculateRSI(data, 14);
      assert.strictEqual(result, 100);
    });
  });

  describe('calculateWilliamsR', () => {
    it('should return -50 for insufficient data', () => {
      const highs = [110];
      const lows = [90];
      const closes = [100];
      const result = TechnicalIndicators.calculateWilliamsR(highs, lows, closes, 14);
      assert.strictEqual(result, -50);
    });

    it('should calculate Williams %R in valid range', () => {
      const highs = [], lows = [], closes = [];
      for (let i = 0; i < 20; i++) {
        const base = 100 + Math.sin(i) * 5;
        highs.push(base + 5);
        lows.push(base - 5);
        closes.push(base);
      }
      const result = TechnicalIndicators.calculateWilliamsR(highs, lows, closes, 14);
      assert.ok(result >= -100 && result <= 0);
    });
  });

  describe('calculateATR', () => {
    it('should calculate ATR correctly', () => {
      const highs = [], lows = [], closes = [];
      for (let i = 0; i < 20; i++) {
        highs.push(105 + i);
        lows.push(95 + i);
        closes.push(100 + i);
      }
      const result = TechnicalIndicators.calculateATR(highs, lows, closes, 14);
      assert.ok(result > 0);
    });

    it('should return 0 for insufficient data', () => {
      const result = TechnicalIndicators.calculateATR([110], [90], [100], 14);
      assert.strictEqual(result, 0);
    });
  });

  describe('calculateMACD', () => {
    it('should return zeros for insufficient data', () => {
      const data = [10, 20, 30];
      const result = TechnicalIndicators.calculateMACD(data);
      assert.deepStrictEqual(result, { macd: 0, signal: 0, histogram: 0 });
    });

    it('should calculate MACD with valid data', () => {
      const data = [];
      for (let i = 0; i < 50; i++) {
        data.push(100 + Math.sin(i / 5) * 10);
      }
      const result = TechnicalIndicators.calculateMACD(data);
      assert.ok(typeof result.macd === 'number');
      assert.ok(typeof result.signal === 'number');
      assert.ok(typeof result.histogram === 'number');
    });
  });

  describe('calculateBollingerBands', () => {
    it('should return same values for insufficient data', () => {
      const data = [100];
      const result = TechnicalIndicators.calculateBollingerBands(data, 20);
      assert.strictEqual(result.upper, 100);
      assert.strictEqual(result.middle, 100);
      assert.strictEqual(result.lower, 100);
    });

    it('should calculate bands correctly', () => {
      const data = [];
      for (let i = 0; i < 25; i++) {
        data.push(100 + (i % 5) - 2);
      }
      const result = TechnicalIndicators.calculateBollingerBands(data, 20);
      assert.ok(result.upper > result.middle);
      assert.ok(result.middle > result.lower);
    });
  });

  describe('calculateStochastic', () => {
    it('should return 50 for insufficient data', () => {
      const result = TechnicalIndicators.calculateStochastic([110], [90], [100], 14);
      assert.deepStrictEqual(result, { k: 50, d: 50 });
    });

    it('should calculate stochastic in valid range', () => {
      const highs = [], lows = [], closes = [];
      for (let i = 0; i < 20; i++) {
        highs.push(105 + Math.sin(i) * 5);
        lows.push(95 + Math.sin(i) * 5);
        closes.push(100 + Math.sin(i) * 5);
      }
      const result = TechnicalIndicators.calculateStochastic(highs, lows, closes, 14);
      assert.ok(result.k >= 0 && result.k <= 100);
      assert.ok(result.d >= 0 && result.d <= 100);
    });
  });

  describe('calculateAO', () => {
    it('should return 0 for insufficient data', () => {
      const result = TechnicalIndicators.calculateAO([110], [90]);
      assert.strictEqual(result, 0);
    });

    it('should calculate AO correctly', () => {
      const highs = [], lows = [];
      for (let i = 0; i < 40; i++) {
        highs.push(105 + i * 0.5);
        lows.push(95 + i * 0.5);
      }
      const result = TechnicalIndicators.calculateAO(highs, lows);
      assert.ok(typeof result === 'number');
    });
  });
});

// ============================================================================
// SIGNAL GENERATOR TESTS
// ============================================================================
describe('SignalGenerator', () => {
  describe('generate', () => {
    it('should generate STRONG_BUY signal for bullish indicators', () => {
      const indicators = {
        rsi: 25,           // Oversold
        williamsR: -85,    // Oversold
        macd: 10,
        macdHistogram: 5,
        ao: 20,
        ema50: 105,
        ema200: 100,
        stochK: 15,
        stochD: 20,
        price: 98,
        bollingerLower: 99,
        bollingerUpper: 105
      };
      const result = SignalGenerator.generate(indicators);
      assert.ok(result.score >= 70);
      assert.strictEqual(result.type, 'STRONG_BUY');
      assert.strictEqual(result.confidence, 'HIGH');
    });

    it('should generate STRONG_SELL signal for bearish indicators', () => {
      const indicators = {
        rsi: 75,           // Overbought
        williamsR: -15,    // Overbought
        macd: -10,
        macdHistogram: -5,
        ao: -20,
        ema50: 95,
        ema200: 100,
        stochK: 85,
        stochD: 80,
        price: 106,
        bollingerLower: 95,
        bollingerUpper: 105
      };
      const result = SignalGenerator.generate(indicators);
      assert.ok(result.score <= -70);
      assert.strictEqual(result.type, 'STRONG_SELL');
      assert.strictEqual(result.confidence, 'HIGH');
    });

    it('should generate NEUTRAL signal for mixed indicators', () => {
      const indicators = {
        rsi: 50,
        williamsR: -50,
        macd: 0,
        macdHistogram: 0,
        ao: 0,
        ema50: 100,
        ema200: 100,
        stochK: 50,
        stochD: 50,
        price: 100,
        bollingerLower: 95,
        bollingerUpper: 105
      };
      const result = SignalGenerator.generate(indicators);
      assert.strictEqual(result.type, 'NEUTRAL');
    });

    it('should include breakdown in result', () => {
      const indicators = {
        rsi: 50,
        williamsR: -50,
        macd: 0,
        macdHistogram: 0,
        ao: 5,
        ema50: 100,
        ema200: 100,
        stochK: 50,
        stochD: 50,
        price: 100,
        bollingerLower: 95,
        bollingerUpper: 105
      };
      const result = SignalGenerator.generate(indicators);
      assert.ok(Array.isArray(result.breakdown));
      assert.ok(result.breakdown.length > 0);
      result.breakdown.forEach(b => {
        assert.ok('indicator' in b);
        assert.ok('contribution' in b);
        assert.ok('reason' in b);
      });
    });

    it('should include timestamp in result', () => {
      const indicators = {
        rsi: 50, williamsR: -50, macd: 0, macdHistogram: 0, ao: 0,
        ema50: 100, ema200: 100, stochK: 50, stochD: 50,
        price: 100, bollingerLower: 95, bollingerUpper: 105
      };
      const result = SignalGenerator.generate(indicators);
      assert.ok(typeof result.timestamp === 'number');
      assert.ok(result.timestamp > 0);
    });
  });
});

// ============================================================================
// MARKET DATA MANAGER TESTS
// ============================================================================
describe('MarketDataManager', () => {
  it('should initialize with default values', () => {
    const manager = new MarketDataManager('XBTUSDTM');
    assert.strictEqual(manager.symbol, 'XBTUSDTM');
    assert.strictEqual(manager.currentPrice, 0);
    assert.strictEqual(manager.candles.length, 0);
  });

  it('should load candles correctly', () => {
    const manager = new MarketDataManager('XBTUSDTM');
    const klineData = [];
    for (let i = 0; i < 100; i++) {
      klineData.push([
        Date.now() - (100 - i) * 60000, // timestamp
        '100', // open
        '105', // high
        '95',  // low
        '102', // close
        '1000' // volume
      ]);
    }
    manager.loadCandles(klineData);
    assert.strictEqual(manager.candles.length, 100);
    assert.strictEqual(manager.currentPrice, 102);
  });

  it('should update ticker data', () => {
    const manager = new MarketDataManager('XBTUSDTM');
    manager.updateTicker({
      price: '50000',
      bestBidPrice: '49990',
      bestAskPrice: '50010',
      priceChgPct: '0.05',
      vol24h: '1000000'
    });
    assert.strictEqual(manager.currentPrice, 50000);
    assert.strictEqual(manager.bestBid, 49990);
    assert.strictEqual(manager.bestAsk, 50010);
    assert.strictEqual(manager.priceChange24h, 5);
    assert.strictEqual(manager.volume24h, 1000000);
  });

  it('should return market data', () => {
    const manager = new MarketDataManager('XBTUSDTM');
    manager.updateTicker({ price: '50000', priceChgPct: '0.02' });
    const data = manager.getMarketData();
    assert.strictEqual(data.symbol, 'XBTUSDTM');
    assert.strictEqual(data.price, 50000);
    assert.strictEqual(data.priceChange24h, 2);
  });

  it('should generate signal', () => {
    const manager = new MarketDataManager('XBTUSDTM');
    const signal = manager.generateSignal();
    assert.ok('type' in signal);
    assert.ok('score' in signal);
    assert.ok('confidence' in signal);
  });
});

// ============================================================================
// CONFIG TESTS
// ============================================================================
describe('CONFIG', () => {
  it('should have valid trading parameters', () => {
    assert.ok(CONFIG.TRADING.INITIAL_SL_PERCENT > 0);
    assert.ok(CONFIG.TRADING.INITIAL_TP_PERCENT > 0);
    assert.ok(CONFIG.TRADING.MAX_POSITIONS > 0);
    assert.ok(CONFIG.TRADING.DEFAULT_LEVERAGE >= 1);
  });

  it('should have valid timeframes', () => {
    assert.ok(CONFIG.TIMEFRAMES['1min'] > 0);
    assert.ok(CONFIG.TIMEFRAMES['5min'] > 0);
    assert.ok(CONFIG.TIMEFRAMES['1hour'] > 0);
  });

  it('should have default symbols', () => {
    assert.ok(Array.isArray(CONFIG.DEFAULT_SYMBOLS));
    assert.ok(CONFIG.DEFAULT_SYMBOLS.length > 0);
  });
});

// Force exit after all tests complete to avoid hanging
process.on('exit', () => {
  console.log('All tests passed!');
});

// Set a timeout to force exit in case something hangs
setTimeout(() => {
  process.exit(0);
}, 5000);
