// ============================================================================
// KuCoin Perpetual Futures Dashboard - Semi-Automated Trading System
// Version: 3.4.2
// Features: Manual Entry, Automated Break-Even & Trailing Stop, Signal Generator
// V3.4: Dollar-based position sizing + Leveraged P&L percentages
// V3.4.1: Leverage-adjusted SL/TP (ROI-based, not price-based)
// V3.4.2: Fixed floating-point precision errors in price rounding
// ============================================================================

require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const { EventEmitter } = require('events');

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
  PORT: process.env.PORT || 3001,
  KUCOIN_FUTURES_API: 'https://api-futures.kucoin.com',
  
  // Trading Parameters (percentages)
  TRADING: {
    INITIAL_SL_PERCENT: 0.5,        // 0.5% below entry
    INITIAL_TP_PERCENT: 2.0,        // 2.0% above entry (4:1 R:R)
    BREAK_EVEN_TRIGGER: 0.001,      // Any profit > 0 (0.001% to avoid floating point issues)
    TRAILING_STEP_PERCENT: 0.15,    // Every 0.15% profit
    TRAILING_MOVE_PERCENT: 0.05,    // SL moves 0.05%
    POSITION_SIZE_PERCENT: 0.5,     // 0.5% of account balance
    DEFAULT_LEVERAGE: 10,
    MAX_POSITIONS: 5
  },
  
  // Default symbols
  DEFAULT_SYMBOLS: ['XBTUSDTM', 'ETHUSDTM', 'SOLUSDTM', 'BNBUSDTM', 'XRPUSDTM'],
  
  // Timeframes (in minutes for KuCoin API)
  TIMEFRAMES: {
    '1min': 1,
    '5min': 5,
    '15min': 15,
    '30min': 30,
    '1hour': 60,
    '4hour': 240,
    '1day': 1440
  },
  
  // Data file for position persistence
  POSITIONS_FILE: './positions.json'
};

// ============================================================================
// EXPRESS & WEBSOCKET SETUP
// ============================================================================
const app = express();
app.use(express.json());

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  // CSP disabled for local development - DevTools uses eval() internally
  // Uncomment below for production deployment:
  // res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' ws: wss:; img-src 'self' data:; media-src 'self' data: blob:;");
  next();
});

// Favicon handler
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ============================================================================
// API CREDENTIALS
// ============================================================================
const KUCOIN_API_KEY = process.env.KUCOIN_API_KEY;
const KUCOIN_API_SECRET = process.env.KUCOIN_API_SECRET;
const KUCOIN_API_PASSPHRASE = process.env.KUCOIN_API_PASSPHRASE;

if (!KUCOIN_API_KEY || !KUCOIN_API_SECRET || !KUCOIN_API_PASSPHRASE) {
  console.error('═══════════════════════════════════════════════════════════════');
  console.error('  ERROR: Missing KuCoin API credentials');
  console.error('  Please set in .env file:');
  console.error('    KUCOIN_API_KEY=your_api_key');
  console.error('    KUCOIN_API_SECRET=your_api_secret');
  console.error('    KUCOIN_API_PASSPHRASE=your_passphrase');
  console.error('═══════════════════════════════════════════════════════════════');
  process.exit(1);
}

// ============================================================================
// GLOBAL STATE
// ============================================================================
const marketManagers = {};           // Symbol -> MarketDataManager
const activePositions = new Map();   // Symbol -> PositionManager
const orderBooks = {};               // Symbol -> { bids: [], asks: [] }
const fundingRates = {};             // Symbol -> { rate, nextFundingTime }
const contractSpecs = {};            // Symbol -> { tickSize, lotSize, multiplier }
const wsClients = new Set();         // Connected dashboard clients
const positionMonitor = new EventEmitter();

let currentTimeframe = '5min';
let accountBalance = 0;

// ============================================================================
// KUCOIN FUTURES API CLASS
// ============================================================================
class KuCoinFuturesAPI {
  constructor(apiKey, apiSecret, passphrase) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.passphrase = passphrase;
    this.baseURL = CONFIG.KUCOIN_FUTURES_API;
  }

  generateSignature(timestamp, method, endpoint, body = '') {
    const strToSign = timestamp + method + endpoint + body;
    return crypto.createHmac('sha256', this.apiSecret).update(strToSign).digest('base64');
  }

  getHeaders(method, endpoint, body = '') {
    const timestamp = Date.now().toString();
    const signature = this.generateSignature(timestamp, method, endpoint, body);
    const passphraseSignature = crypto.createHmac('sha256', this.apiSecret).update(this.passphrase).digest('base64');

    return {
      'KC-API-KEY': this.apiKey,
      'KC-API-SIGN': signature,
      'KC-API-TIMESTAMP': timestamp,
      'KC-API-PASSPHRASE': passphraseSignature,
      'KC-API-KEY-VERSION': '2',
      'Content-Type': 'application/json'
    };
  }

  async request(method, endpoint, data = null) {
    try {
      const body = data ? JSON.stringify(data) : '';
      const headers = this.getHeaders(method, endpoint, body);
      const url = `${this.baseURL}${endpoint}`;

      const response = await axios({
        method,
        url,
        headers,
        ...(data && { data }),
        timeout: 10000
      });

      if (response.data.code !== '200000') {
        throw new Error(response.data.msg || 'API Error');
      }

      return response.data;
    } catch (error) {
      const msg = error.response?.data?.msg || error.message;
      console.error(`[API ERROR] ${method} ${endpoint}: ${msg}`);
      throw new Error(msg);
    }
  }

  // Public endpoints (no auth needed)
  async getServerTime() {
    const response = await axios.get(`${this.baseURL}/api/v1/timestamp`);
    return response.data;
  }

  async getContracts() {
    const response = await axios.get(`${this.baseURL}/api/v1/contracts/active`);
    return response.data;
  }

  async getContractDetail(symbol) {
    const response = await axios.get(`${this.baseURL}/api/v1/contracts/${symbol}`);
    return response.data;
  }

  async getTicker(symbol) {
    const response = await axios.get(`${this.baseURL}/api/v1/ticker?symbol=${symbol}`);
    return response.data;
  }

  async getOrderBook(symbol, depth = 20) {
    const response = await axios.get(`${this.baseURL}/api/v1/level2/depth${depth}?symbol=${symbol}`);
    return response.data;
  }

  async getKlines(symbol, granularity, from, to) {
    const response = await axios.get(`${this.baseURL}/api/v1/kline/query`, {
      params: { symbol, granularity, from, to }
    });
    return response.data;
  }

  async getFundingRate(symbol) {
    const response = await axios.get(`${this.baseURL}/api/v1/funding-rate/${symbol}/current`);
    return response.data;
  }

  // Private endpoints (auth required)
  async getAccountOverview(currency = 'USDT') {
    return this.request('GET', `/api/v1/account-overview?currency=${currency}`);
  }

  async getPosition(symbol) {
    return this.request('GET', `/api/v1/position?symbol=${symbol}`);
  }

  async getAllPositions() {
    return this.request('GET', '/api/v1/positions');
  }

  async placeOrder(params) {
    return this.request('POST', '/api/v1/orders', params);
  }

  async placeStopOrder(params) {
    return this.request('POST', '/api/v1/stop-orders', params);
  }

  async cancelOrder(orderId) {
    return this.request('DELETE', `/api/v1/orders/${orderId}`);
  }

  async cancelStopOrder(orderId) {
    return this.request('DELETE', `/api/v1/stop-orders/${orderId}`);
  }

  async cancelAllOrders(symbol) {
    return this.request('DELETE', `/api/v1/orders?symbol=${symbol}`);
  }

  async cancelAllStopOrders(symbol) {
    return this.request('DELETE', `/api/v1/stop-orders?symbol=${symbol}`);
  }

  async getOpenOrders(symbol) {
    return this.request('GET', `/api/v1/orders?symbol=${symbol}&status=active`);
  }

  async getOpenStopOrders(symbol) {
    return this.request('GET', `/api/v1/stop-orders?symbol=${symbol}`);
  }

  async getOrderDetail(orderId) {
    return this.request('GET', `/api/v1/orders/${orderId}`);
  }

  async setLeverage(symbol, leverage) {
    // KuCoin uses risk limit to set leverage indirectly
    // For simplicity, we include leverage in the order
    return { success: true, leverage };
  }

  async getWebSocketToken() {
    return this.request('POST', '/api/v1/bullet-private');
  }

  async getPublicWebSocketToken() {
    const response = await axios.post(`${this.baseURL}/api/v1/bullet-public`);
    return response.data;
  }
}

const kucoinAPI = new KuCoinFuturesAPI(KUCOIN_API_KEY, KUCOIN_API_SECRET, KUCOIN_API_PASSPHRASE);

// ============================================================================
// TECHNICAL INDICATORS
// ============================================================================
class TechnicalIndicators {
  static calculateSMA(data, period) {
    if (!data || data.length < period) return null;
    const slice = data.slice(-period);
    return slice.reduce((sum, val) => sum + val, 0) / period;
  }

  static calculateEMA(data, period) {
    if (!data || data.length < period) return null;
    const multiplier = 2 / (period + 1);
    let ema = this.calculateSMA(data.slice(0, period), period);
    if (ema === null) return null;
    
    for (let i = period; i < data.length; i++) {
      ema = (data[i] - ema) * multiplier + ema;
    }
    return ema;
  }

  static calculateRSI(data, period = 14) {
    if (!data || data.length < period + 1) return 50;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = data.length - period; i < data.length; i++) {
      const change = data[i] - data[i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  static calculateWilliamsR(highs, lows, closes, period = 14) {
    if (!closes || closes.length < period) return -50;
    
    const recentHighs = highs.slice(-period);
    const recentLows = lows.slice(-period);
    const currentClose = closes[closes.length - 1];
    
    const highestHigh = Math.max(...recentHighs);
    const lowestLow = Math.min(...recentLows);
    
    if (highestHigh === lowestLow) return -50;
    return ((highestHigh - currentClose) / (highestHigh - lowestLow)) * -100;
  }

  static calculateATR(highs, lows, closes, period = 14) {
    if (!closes || closes.length < period + 1) return 0;
    
    const trueRanges = [];
    for (let i = 1; i < closes.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trueRanges.push(tr);
    }
    
    return this.calculateSMA(trueRanges.slice(-period), period) || 0;
  }

  static calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (!data || data.length < slowPeriod) return { macd: 0, signal: 0, histogram: 0 };
    
    const fastEMA = this.calculateEMA(data, fastPeriod);
    const slowEMA = this.calculateEMA(data, slowPeriod);
    
    if (fastEMA === null || slowEMA === null) return { macd: 0, signal: 0, histogram: 0 };
    
    const macd = fastEMA - slowEMA;
    
    // Simplified signal line calculation
    const signal = macd * 0.85;
    const histogram = macd - signal;
    
    return { macd, signal, histogram };
  }

  static calculateAO(highs, lows, shortPeriod = 5, longPeriod = 34) {
    if (!highs || highs.length < longPeriod) return 0;
    
    const medianPrices = highs.map((high, i) => (high + lows[i]) / 2);
    const shortSMA = this.calculateSMA(medianPrices.slice(-shortPeriod), shortPeriod);
    const longSMA = this.calculateSMA(medianPrices.slice(-longPeriod), longPeriod);
    
    if (shortSMA === null || longSMA === null) return 0;
    return shortSMA - longSMA;
  }

  static calculateBollingerBands(data, period = 20, stdDev = 2) {
    if (!data || data.length < period) {
      const lastPrice = data && data.length > 0 ? data[data.length - 1] : 0;
      return { upper: lastPrice, middle: lastPrice, lower: lastPrice };
    }
    
    const slice = data.slice(-period);
    const sma = slice.reduce((sum, val) => sum + val, 0) / period;
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
    const std = Math.sqrt(variance);
    
    return {
      upper: sma + (stdDev * std),
      middle: sma,
      lower: sma - (stdDev * std)
    };
  }

  static calculateStochastic(highs, lows, closes, period = 14, smoothK = 3, smoothD = 3) {
    if (!closes || closes.length < period) return { k: 50, d: 50 };
    
    const recentHighs = highs.slice(-period);
    const recentLows = lows.slice(-period);
    const currentClose = closes[closes.length - 1];
    
    const highestHigh = Math.max(...recentHighs);
    const lowestLow = Math.min(...recentLows);
    
    if (highestHigh === lowestLow) return { k: 50, d: 50 };
    
    const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
    const d = k * 0.8; // Simplified %D
    
    return { k, d };
  }
}

// ============================================================================
// SIGNAL GENERATOR (-100 to +100)
// ============================================================================
class SignalGenerator {
  static generate(indicators) {
    let score = 0;
    const breakdown = [];

    // RSI (±25 points)
    if (indicators.rsi < 30) {
      score += 25;
      breakdown.push({ indicator: 'RSI', value: indicators.rsi.toFixed(1), contribution: 25, reason: 'Oversold (<30)', type: 'bullish' });
    } else if (indicators.rsi < 40) {
      score += 15;
      breakdown.push({ indicator: 'RSI', value: indicators.rsi.toFixed(1), contribution: 15, reason: 'Approaching oversold', type: 'bullish' });
    } else if (indicators.rsi > 70) {
      score -= 25;
      breakdown.push({ indicator: 'RSI', value: indicators.rsi.toFixed(1), contribution: -25, reason: 'Overbought (>70)', type: 'bearish' });
    } else if (indicators.rsi > 60) {
      score -= 15;
      breakdown.push({ indicator: 'RSI', value: indicators.rsi.toFixed(1), contribution: -15, reason: 'Approaching overbought', type: 'bearish' });
    } else {
      breakdown.push({ indicator: 'RSI', value: indicators.rsi.toFixed(1), contribution: 0, reason: 'Neutral (40-60)', type: 'neutral' });
    }

    // Williams %R (±20 points)
    if (indicators.williamsR < -80) {
      score += 20;
      breakdown.push({ indicator: 'Williams %R', value: indicators.williamsR.toFixed(1), contribution: 20, reason: 'Oversold (<-80)', type: 'bullish' });
    } else if (indicators.williamsR > -20) {
      score -= 20;
      breakdown.push({ indicator: 'Williams %R', value: indicators.williamsR.toFixed(1), contribution: -20, reason: 'Overbought (>-20)', type: 'bearish' });
    } else {
      breakdown.push({ indicator: 'Williams %R', value: indicators.williamsR.toFixed(1), contribution: 0, reason: 'Neutral', type: 'neutral' });
    }

    // MACD (±20 points)
    if (indicators.macd > 0 && indicators.macdHistogram > 0) {
      score += 20;
      breakdown.push({ indicator: 'MACD', value: indicators.macd.toFixed(2), contribution: 20, reason: 'Bullish momentum', type: 'bullish' });
    } else if (indicators.macd < 0 && indicators.macdHistogram < 0) {
      score -= 20;
      breakdown.push({ indicator: 'MACD', value: indicators.macd.toFixed(2), contribution: -20, reason: 'Bearish momentum', type: 'bearish' });
    } else {
      breakdown.push({ indicator: 'MACD', value: indicators.macd.toFixed(2), contribution: 0, reason: 'Neutral/Crossover', type: 'neutral' });
    }

    // Awesome Oscillator (±15 points)
    if (indicators.ao > 0) {
      score += 15;
      breakdown.push({ indicator: 'AO', value: indicators.ao.toFixed(2), contribution: 15, reason: 'Positive momentum', type: 'bullish' });
    } else {
      score -= 15;
      breakdown.push({ indicator: 'AO', value: indicators.ao.toFixed(2), contribution: -15, reason: 'Negative momentum', type: 'bearish' });
    }

    // EMA Trend (±20 points)
    if (indicators.ema50 > indicators.ema200) {
      score += 20;
      breakdown.push({ indicator: 'EMA Trend', value: 'EMA50 > EMA200', contribution: 20, reason: 'Bullish trend (Golden Cross)', type: 'bullish' });
    } else if (indicators.ema50 < indicators.ema200) {
      score -= 20;
      breakdown.push({ indicator: 'EMA Trend', value: 'EMA50 < EMA200', contribution: -20, reason: 'Bearish trend (Death Cross)', type: 'bearish' });
    } else {
      breakdown.push({ indicator: 'EMA Trend', value: 'EMA50 ≈ EMA200', contribution: 0, reason: 'Neutral', type: 'neutral' });
    }

    // Stochastic (±10 points)
    if (indicators.stochK < 20 && indicators.stochK > indicators.stochD) {
      score += 10;
      breakdown.push({ indicator: 'Stochastic', value: indicators.stochK.toFixed(1), contribution: 10, reason: 'Oversold + bullish crossover', type: 'bullish' });
    } else if (indicators.stochK > 80 && indicators.stochK < indicators.stochD) {
      score -= 10;
      breakdown.push({ indicator: 'Stochastic', value: indicators.stochK.toFixed(1), contribution: -10, reason: 'Overbought + bearish crossover', type: 'bearish' });
    } else {
      breakdown.push({ indicator: 'Stochastic', value: indicators.stochK.toFixed(1), contribution: 0, reason: 'Neutral', type: 'neutral' });
    }

    // Bollinger Bands (±10 points)
    if (indicators.price < indicators.bollingerLower) {
      score += 10;
      breakdown.push({ indicator: 'Bollinger', value: 'Below lower', contribution: 10, reason: 'Price below lower band', type: 'bullish' });
    } else if (indicators.price > indicators.bollingerUpper) {
      score -= 10;
      breakdown.push({ indicator: 'Bollinger', value: 'Above upper', contribution: -10, reason: 'Price above upper band', type: 'bearish' });
    } else {
      breakdown.push({ indicator: 'Bollinger', value: 'Within bands', contribution: 0, reason: 'Price within bands', type: 'neutral' });
    }

    // Determine signal type
    let type = 'NEUTRAL';
    let confidence = 'LOW';
    
    if (score >= 70) { type = 'STRONG_BUY'; confidence = 'HIGH'; }
    else if (score >= 50) { type = 'BUY'; confidence = 'MEDIUM'; }
    else if (score >= 30) { type = 'BUY'; confidence = 'LOW'; }
    else if (score <= -70) { type = 'STRONG_SELL'; confidence = 'HIGH'; }
    else if (score <= -50) { type = 'SELL'; confidence = 'MEDIUM'; }
    else if (score <= -30) { type = 'SELL'; confidence = 'LOW'; }

    return {
      type,
      score,
      confidence,
      breakdown,
      timestamp: Date.now()
    };
  }
}

// ============================================================================
// MARKET DATA MANAGER
// ============================================================================
class MarketDataManager {
  constructor(symbol) {
    this.symbol = symbol;
    this.candles = [];
    this.maxCandles = 500;
    this.currentPrice = 0;
    this.priceChange24h = 0;
    this.volume24h = 0;
    this.bestBid = 0;
    this.bestAsk = 0;
  }

  addCandle(candle) {
    this.candles.push(candle);
    if (this.candles.length > this.maxCandles) {
      this.candles.shift();
    }
    this.currentPrice = candle.close;
  }

  loadCandles(klineData) {
    if (!klineData || !Array.isArray(klineData)) return;
    
    this.candles = klineData.map(k => ({
      timestamp: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    })).sort((a, b) => a.timestamp - b.timestamp);
    
    if (this.candles.length > 0) {
      this.currentPrice = this.candles[this.candles.length - 1].close;
    }
  }

  updateTicker(tickerData) {
    if (tickerData.price) this.currentPrice = parseFloat(tickerData.price);
    if (tickerData.bestBidPrice) this.bestBid = parseFloat(tickerData.bestBidPrice);
    if (tickerData.bestAskPrice) this.bestAsk = parseFloat(tickerData.bestAskPrice);
    if (tickerData.priceChgPct) this.priceChange24h = parseFloat(tickerData.priceChgPct) * 100;
    if (tickerData.vol24h) this.volume24h = parseFloat(tickerData.vol24h);
  }

  getIndicators() {
    if (this.candles.length < 50) {
      return {
        price: this.currentPrice,
        rsi: 50,
        williamsR: -50,
        atr: 0,
        ao: 0,
        macd: 0,
        macdSignal: 0,
        macdHistogram: 0,
        ema50: this.currentPrice,
        ema200: this.currentPrice,
        bollingerUpper: this.currentPrice,
        bollingerMiddle: this.currentPrice,
        bollingerLower: this.currentPrice,
        stochK: 50,
        stochD: 50
      };
    }

    const closes = this.candles.map(c => c.close);
    const highs = this.candles.map(c => c.high);
    const lows = this.candles.map(c => c.low);

    const macdData = TechnicalIndicators.calculateMACD(closes);
    const bbData = TechnicalIndicators.calculateBollingerBands(closes);
    const stochData = TechnicalIndicators.calculateStochastic(highs, lows, closes);

    return {
      price: this.currentPrice,
      rsi: TechnicalIndicators.calculateRSI(closes, 14),
      williamsR: TechnicalIndicators.calculateWilliamsR(highs, lows, closes, 14),
      atr: TechnicalIndicators.calculateATR(highs, lows, closes, 14),
      ao: TechnicalIndicators.calculateAO(highs, lows, 5, 34),
      macd: macdData.macd,
      macdSignal: macdData.signal,
      macdHistogram: macdData.histogram,
      ema50: TechnicalIndicators.calculateEMA(closes, 50) || this.currentPrice,
      ema200: TechnicalIndicators.calculateEMA(closes, Math.min(200, closes.length)) || this.currentPrice,
      bollingerUpper: bbData.upper,
      bollingerMiddle: bbData.middle,
      bollingerLower: bbData.lower,
      stochK: stochData.k,
      stochD: stochData.d
    };
  }

  generateSignal() {
    const indicators = this.getIndicators();
    return SignalGenerator.generate(indicators);
  }

  getMarketData() {
    return {
      symbol: this.symbol,
      price: this.currentPrice,
      priceChange24h: this.priceChange24h,
      volume24h: this.volume24h,
      bestBid: this.bestBid,
      bestAsk: this.bestAsk
    };
  }
}

// ============================================================================
// POSITION MANAGER
// ============================================================================
class PositionManager {
  constructor(positionData, api) {
    this.api = api;
    this.symbol = positionData.symbol;
    this.side = positionData.side; // 'long' or 'short'
    this.size = positionData.size;
    this.leverage = positionData.leverage || CONFIG.TRADING.DEFAULT_LEVERAGE;
    this.entryPrice = positionData.entryPrice;
    this.currentPrice = positionData.currentPrice || positionData.entryPrice;
    
    // V3.4: Position sizing with leverage
    this.positionValueUSD = positionData.positionValueUSD || (this.size * this.entryPrice * (contractSpecs[this.symbol]?.multiplier || 1));
    this.marginUsed = positionData.marginUsed || (this.positionValueUSD / this.leverage);
    
    // Order IDs
    this.entryOrderId = positionData.entryOrderId || null;
    this.slOrderId = positionData.slOrderId || null;
    this.tpOrderId = positionData.tpOrderId || null;
    
    // Stop Loss & Take Profit
    this.initialSL = positionData.initialSL;
    this.currentSL = positionData.currentSL || positionData.initialSL;
    this.takeProfit = positionData.takeProfit;
    
    // State tracking
    this.breakEvenTriggered = positionData.breakEvenTriggered || false;
    this.lastTrailingLevel = positionData.lastTrailingLevel || 0;
    this.unrealizedPnl = 0;
    this.unrealizedPnlPercent = 0;
    
    // Timestamps
    this.openedAt = positionData.openedAt || Date.now();
    this.updatedAt = Date.now();
    
    // Status: 'pending', 'open', 'closing', 'closed'
    this.status = positionData.status || 'pending';
  }

  async updatePrice(currentPrice) {
    this.currentPrice = currentPrice;
    this.updatedAt = Date.now();

    // ========================================================================
    // LEVERAGED P&L CALCULATION - V3.4 FIX
    // ========================================================================
    // Calculate price difference
    const priceDiff = this.side === 'long'
      ? (currentPrice - this.entryPrice)
      : (this.entryPrice - currentPrice);

    // P&L in USDT = price difference × size × multiplier
    const contractMultiplier = contractSpecs[this.symbol]?.multiplier || 1;
    this.unrealizedPnl = priceDiff * this.size * contractMultiplier;
    
    // CRITICAL: Leveraged P&L % = (P&L in USDT / Margin Used) × 100
    // This gives the actual profit/loss percentage on YOUR capital, not just price movement
    // Example: $100 margin @ 10x leverage
    //   - Price moves 0.2% in your favor
    //   - Position value moves $20 (0.2% of $10,000 position)
    //   - Your P&L = $20 / $100 margin = 20% leveraged gain
    this.unrealizedPnlPercent = (this.unrealizedPnl / this.marginUsed) * 100;

    // Only manage SL/TP if position is open
    if (this.status !== 'open') return this.toJSON();

    // Check break-even trigger (any profit > 0)
    if (!this.breakEvenTriggered && this.unrealizedPnlPercent > CONFIG.TRADING.BREAK_EVEN_TRIGGER) {
      await this.moveToBreakEven();
    }

    // Check trailing stop
    if (this.breakEvenTriggered) {
      await this.checkTrailingStop();
    }

    // Check if SL hit
    const slHit = this.side === 'long'
      ? currentPrice <= this.currentSL
      : currentPrice >= this.currentSL;

    if (slHit) {
      await this.closePosition('Stop Loss Hit');
    }

    // Check if TP hit
    const tpHit = this.side === 'long'
      ? currentPrice >= this.takeProfit
      : currentPrice <= this.takeProfit;

    if (tpHit) {
      await this.closePosition('Take Profit Hit');
    }

    return this.toJSON();
  }

  async moveToBreakEven() {
    broadcastLog('info', `[${this.symbol}] Moving SL to break-even at entry: ${this.entryPrice.toFixed(2)}`);
    
    this.currentSL = this.entryPrice;
    this.breakEvenTriggered = true;
    this.lastTrailingLevel = this.unrealizedPnlPercent;
    
    // Update SL order on KuCoin
    await this.updateStopLossOrder();
    
    broadcastAlert('breakeven', `${this.symbol} ${this.side.toUpperCase()} moved to break-even!`);
    savePositions();
  }

  async checkTrailingStop() {
    const profitPercent = this.unrealizedPnlPercent;
    const stepPercent = CONFIG.TRADING.TRAILING_STEP_PERCENT;
    const movePercent = CONFIG.TRADING.TRAILING_MOVE_PERCENT;

    // Check if we've moved another step since last trail
    const stepsSinceLastTrail = Math.floor((profitPercent - this.lastTrailingLevel) / stepPercent);

    if (stepsSinceLastTrail > 0) {
      // Calculate new SL
      const slMove = stepsSinceLastTrail * movePercent;
      const newSL = this.side === 'long'
        ? this.currentSL * (1 + slMove / 100)
        : this.currentSL * (1 - slMove / 100);

      // Only move SL in favorable direction
      const shouldMove = this.side === 'long'
        ? newSL > this.currentSL
        : newSL < this.currentSL;

      if (shouldMove) {
        broadcastLog('info', `[${this.symbol}] Trailing SL from ${this.currentSL.toFixed(2)} to ${newSL.toFixed(2)} (+${profitPercent.toFixed(2)}% profit)`);
        
        this.currentSL = newSL;
        this.lastTrailingLevel = profitPercent;
        
        // Update SL order on KuCoin
        await this.updateStopLossOrder();
        
        broadcastAlert('trailing', `${this.symbol} SL trailed to ${newSL.toFixed(2)}`);
        savePositions();
      }
    }
  }

  async updateStopLossOrder() {
    try {
      // Cancel existing SL order
      if (this.slOrderId) {
        try {
          await this.api.cancelStopOrder(this.slOrderId);
        } catch (e) {
          // Order might already be cancelled or filled
        }
      }

      // Place new SL order
      const slSide = this.side === 'long' ? 'sell' : 'buy';
      const slParams = {
        clientOid: `sl_${this.symbol}_${Date.now()}`,
        side: slSide,
        symbol: this.symbol,
        type: 'market',
        stop: this.side === 'long' ? 'down' : 'up',
        stopPrice: this.currentSL.toString(),
        stopPriceType: 'TP',
        size: this.size.toString(),
        reduceOnly: true
      };

      const result = await this.api.placeStopOrder(slParams);
      if (result.data) {
        this.slOrderId = result.data.orderId;
        broadcastLog('success', `[${this.symbol}] SL order updated: ${this.currentSL.toFixed(2)}`);
      }
    } catch (error) {
      broadcastLog('error', `[${this.symbol}] Failed to update SL order: ${error.message}`);
    }
  }

  async closePosition(reason) {
    if (this.status === 'closing' || this.status === 'closed') return;
    
    this.status = 'closing';
    broadcastLog('info', `[${this.symbol}] Closing position: ${reason}`);

    try {
      // Cancel all pending orders for this symbol
      try {
        await this.api.cancelAllStopOrders(this.symbol);
      } catch (e) {}

      // Place market order to close
      const closeSide = this.side === 'long' ? 'sell' : 'buy';
      const closeParams = {
        clientOid: `close_${this.symbol}_${Date.now()}`,
        side: closeSide,
        symbol: this.symbol,
        type: 'market',
        size: this.size.toString(),
        reduceOnly: true
      };

      const result = await this.api.placeOrder(closeParams);
      
      if (result.data) {
        this.status = 'closed';
        broadcastLog('success', `[${this.symbol}] Position closed. P&L: ${this.unrealizedPnl.toFixed(2)} USDT (${this.unrealizedPnlPercent.toFixed(2)}%)`);
        broadcastAlert('close', `${this.symbol} closed: ${this.unrealizedPnl >= 0 ? '+' : ''}${this.unrealizedPnl.toFixed(2)} USDT`);
        
        // Remove from active positions
        activePositions.delete(this.symbol);
        savePositions();
        broadcastPositions();
      }
    } catch (error) {
      this.status = 'open'; // Revert status
      broadcastLog('error', `[${this.symbol}] Failed to close position: ${error.message}`);
    }
  }

  toJSON() {
    return {
      symbol: this.symbol,
      side: this.side,
      size: this.size,
      leverage: this.leverage,
      entryPrice: this.entryPrice,
      currentPrice: this.currentPrice,
      positionValueUSD: this.positionValueUSD,      // V3.4: Total exposure
      marginUsed: this.marginUsed,                  // V3.4: Margin required
      initialSL: this.initialSL,
      currentSL: this.currentSL,
      takeProfit: this.takeProfit,
      unrealizedPnl: this.unrealizedPnl,
      unrealizedPnlPercent: this.unrealizedPnlPercent,  // V3.4: Now leveraged %
      breakEvenTriggered: this.breakEvenTriggered,
      lastTrailingLevel: this.lastTrailingLevel,
      status: this.status,
      openedAt: this.openedAt,
      updatedAt: this.updatedAt,
      entryOrderId: this.entryOrderId,
      slOrderId: this.slOrderId,
      tpOrderId: this.tpOrderId
    };
  }
}

// ============================================================================
// POSITION PERSISTENCE
// ============================================================================
function savePositions() {
  try {
    const data = {};
    for (const [symbol, manager] of activePositions.entries()) {
      data[symbol] = manager.toJSON();
    }
    fs.writeFileSync(CONFIG.POSITIONS_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('[SAVE ERROR]', error.message);
  }
}

function loadPositions() {
  try {
    if (fs.existsSync(CONFIG.POSITIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG.POSITIONS_FILE, 'utf8'));
      for (const [symbol, posData] of Object.entries(data)) {
        if (posData.status !== 'closed') {
          const manager = new PositionManager(posData, kucoinAPI);
          activePositions.set(symbol, manager);
          broadcastLog('info', `[RESTORE] Loaded position: ${symbol} ${posData.side} @ ${posData.entryPrice}`);
        }
      }
    }
  } catch (error) {
    console.error('[LOAD ERROR]', error.message);
  }
}

// ============================================================================
// BROADCAST FUNCTIONS
// ============================================================================
function broadcast(message) {
  const str = JSON.stringify(message);
  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(str);
    }
  });
}

function broadcastLog(type, message, data = null) {
  const log = {
    id: Date.now() + Math.random(),
    timestamp: new Date().toISOString(),
    type,
    message,
    data
  };
  console.log(`[${type.toUpperCase()}] ${message}`);
  broadcast({ type: 'log', log });
}

function broadcastAlert(alertType, message) {
  broadcast({ type: 'alert', alertType, message, timestamp: Date.now() });
}

function broadcastMarketData(symbol) {
  if (!marketManagers[symbol]) return;
  
  const manager = marketManagers[symbol];
  const indicators = manager.getIndicators();
  const signal = manager.generateSignal();
  const marketData = manager.getMarketData();
  
  broadcast({
    type: 'market_update',
    symbol,
    marketData,
    indicators,
    signal,
    orderBook: orderBooks[symbol] || { bids: [], asks: [] },
    fundingRate: fundingRates[symbol] || { rate: 0, predictedRate: 0 },
    contractSpecs: contractSpecs[symbol] || null
  });
}

function broadcastPositions() {
  const positions = [];
  for (const [symbol, manager] of activePositions.entries()) {
    positions.push(manager.toJSON());
  }
  broadcast({ type: 'positions', data: positions });
}

function broadcastBalance(data) {
  accountBalance = parseFloat(data.accountEquity) || 0;
  broadcast({ type: 'balance', data });
}

function broadcastInitialState(ws) {
  // Send all current data to newly connected client
  const symbols = Object.keys(marketManagers);
  const marketData = {};
  const indicators = {};
  const signals = {};

  symbols.forEach(symbol => {
    const manager = marketManagers[symbol];
    marketData[symbol] = manager.getMarketData();
    indicators[symbol] = manager.getIndicators();
    signals[symbol] = manager.generateSignal();
  });

  const positions = [];
  for (const [symbol, manager] of activePositions.entries()) {
    positions.push(manager.toJSON());
  }

  ws.send(JSON.stringify({
    type: 'initial_state',
    symbols,
    marketData,
    indicators,
    signals,
    orderBooks,
    fundingRates,
    positions,
    accountBalance,
    config: {
      trading: CONFIG.TRADING,
      timeframes: Object.keys(CONFIG.TIMEFRAMES),
      currentTimeframe
    }
  }));
}

// ============================================================================
// DATA FETCHING
// ============================================================================
async function fetchContractSpecs(symbol) {
  try {
    const response = await kucoinAPI.getContractDetail(symbol);
    if (response.data) {
      contractSpecs[symbol] = {
        tickSize: parseFloat(response.data.tickSize),
        lotSize: parseFloat(response.data.lotSize),
        multiplier: parseFloat(response.data.multiplier),
        maxLeverage: response.data.maxLeverage,
        minOrderQty: parseFloat(response.data.minOrderQty || 1),
        maxOrderQty: parseFloat(response.data.maxOrderQty || 1000000)
      };
      broadcastLog('info', `[${symbol}] Contract: tickSize=${contractSpecs[symbol].tickSize}, lotSize=${contractSpecs[symbol].lotSize}, multiplier=${contractSpecs[symbol].multiplier}`);
      return contractSpecs[symbol];
    }
  } catch (error) {
    broadcastLog('warn', `Failed to fetch contract specs for ${symbol}: ${error.message}`);
  }
  return null;
}

async function fetchKlines(symbol, timeframe = currentTimeframe) {
  try {
    const granularity = CONFIG.TIMEFRAMES[timeframe] || 5;
    const to = Date.now();
    const from = to - (granularity * 500 * 60 * 1000);
    
    const response = await kucoinAPI.getKlines(symbol, granularity, from, to);
    
    if (response.data && response.data.length > 0) {
      if (!marketManagers[symbol]) {
        marketManagers[symbol] = new MarketDataManager(symbol);
      }
      marketManagers[symbol].loadCandles(response.data);
      return response.data.length;
    }
    return 0;
  } catch (error) {
    broadcastLog('error', `Failed to fetch klines for ${symbol}: ${error.message}`);
    return 0;
  }
}

async function fetchTicker(symbol) {
  try {
    const response = await kucoinAPI.getTicker(symbol);
    if (response.data) {
      if (!marketManagers[symbol]) {
        marketManagers[symbol] = new MarketDataManager(symbol);
      }
      marketManagers[symbol].updateTicker(response.data);
      return response.data;
    }
  } catch (error) {
    broadcastLog('error', `Failed to fetch ticker for ${symbol}: ${error.message}`);
  }
  return null;
}

async function fetchOrderBook(symbol) {
  try {
    const response = await kucoinAPI.getOrderBook(symbol, 20);
    if (response.data) {
      orderBooks[symbol] = {
        bids: response.data.bids || [],
        asks: response.data.asks || [],
        timestamp: Date.now()
      };
      return orderBooks[symbol];
    }
  } catch (error) {
    broadcastLog('error', `Failed to fetch order book for ${symbol}: ${error.message}`);
  }
  return null;
}

async function fetchFundingRate(symbol) {
  try {
    const response = await kucoinAPI.getFundingRate(symbol);
    if (response.data) {
      fundingRates[symbol] = {
        rate: parseFloat(response.data.value),
        predictedRate: parseFloat(response.data.predictedValue || 0),
        timestamp: Date.now()
      };
      return fundingRates[symbol];
    }
  } catch (error) {
    // Funding rate might not be available for all contracts
  }
  return null;
}

async function fetchAccountBalance() {
  try {
    const response = await kucoinAPI.getAccountOverview('USDT');
    if (response.data) {
      broadcastBalance(response.data);
      return response.data;
    }
  } catch (error) {
    broadcastLog('error', `Failed to fetch balance: ${error.message}`);
  }
  return null;
}

async function initializeSymbol(symbol) {
  broadcastLog('info', `Initializing ${symbol}...`);
  
  // Create manager if doesn't exist
  if (!marketManagers[symbol]) {
    marketManagers[symbol] = new MarketDataManager(symbol);
  }
  
  await fetchContractSpecs(symbol);
  const candleCount = await fetchKlines(symbol);
  await fetchTicker(symbol);
  await fetchOrderBook(symbol);
  await fetchFundingRate(symbol);
  
  broadcastLog('success', `${symbol}: Loaded ${candleCount} candles`);
  broadcastMarketData(symbol);
  
  // Broadcast updated symbol list to all clients
  broadcastSymbolList();
}

function broadcastSymbolList() {
  const symbols = Object.keys(marketManagers);
  broadcast({
    type: 'symbols_updated',
    symbols: symbols
  });
}

async function initializeAllSymbols() {
  broadcastLog('info', 'Initializing market data...');
  
  for (const symbol of CONFIG.DEFAULT_SYMBOLS) {
    await initializeSymbol(symbol);
    await sleep(200); // Rate limiting
  }
  
  broadcastLog('success', 'All symbols initialized');
}

// ============================================================================
// ORDER EXECUTION
// ============================================================================
async function executeEntry(symbol, side, positionSizePercent = CONFIG.TRADING.POSITION_SIZE_PERCENT, leverage = CONFIG.TRADING.DEFAULT_LEVERAGE) {
  // Check max positions
  if (activePositions.size >= CONFIG.TRADING.MAX_POSITIONS) {
    broadcastLog('error', `Max positions (${CONFIG.TRADING.MAX_POSITIONS}) reached. Cannot open new position.`);
    return { success: false, error: 'Max positions reached' };
  }

  // Check if already have position in this symbol
  if (activePositions.has(symbol)) {
    broadcastLog('error', `Already have an open position in ${symbol}`);
    return { success: false, error: 'Position already exists' };
  }

  // Get order book for entry price
  const ob = orderBooks[symbol];
  if (!ob || !ob.bids || !ob.asks || ob.bids.length < 10 || ob.asks.length < 10) {
    await fetchOrderBook(symbol);
  }

  const orderBook = orderBooks[symbol];
  if (!orderBook) {
    broadcastLog('error', `No order book data for ${symbol}`);
    return { success: false, error: 'No order book data' };
  }

  // Get 9th level price
  const entryPrice = side === 'long'
    ? parseFloat(orderBook.bids[8][0])  // 9th bid for long
    : parseFloat(orderBook.asks[8][0]); // 9th ask for short

  // Get contract specs
  let specs = contractSpecs[symbol];
  if (!specs) {
    specs = await fetchContractSpecs(symbol);
  }
  if (!specs) {
    broadcastLog('error', `No contract specs for ${symbol}`);
    return { success: false, error: 'No contract specs' };
  }

  // ========================================================================
  // POSITION SIZING WITH LEVERAGE - V3.4 FIX
  // ========================================================================
  // Margin used = accountBalance * positionSizePercent (the actual USDT risk)
  const marginUsed = accountBalance * (positionSizePercent / 100);
  
  // Position value with leverage = margin * leverage (total exposure)
  const positionValueUSD = marginUsed * leverage;
  
  // Convert to lots: positionValue / (price * multiplier)
  const contractValue = entryPrice * specs.multiplier;
  let size = Math.floor(positionValueUSD / contractValue);
  
  // Ensure size meets lot size requirements
  const lotSize = specs.lotSize || 1;
  size = Math.floor(size / lotSize) * lotSize;
  
  // Calculate actual position value based on rounded lots
  const actualPositionValueUSD = size * contractValue;
  const actualMarginUsed = actualPositionValueUSD / leverage;
  
  if (size < lotSize) {
    broadcastLog('error', `Position size too small. Calculated: ${size} lots`);
    broadcastLog('error', `Margin: $${marginUsed.toFixed(2)} → Position Value: $${positionValueUSD.toFixed(2)} @ ${leverage}x`);
    broadcastLog('error', `Need more balance ($${accountBalance.toFixed(2)} USDT) or higher leverage`);
    return { success: false, error: 'Position size too small' };
  }

  // ========================================================================
  // LEVERAGE-ADJUSTED SL & TP CALCULATION - V3.4.1 FIX
  // ========================================================================
  // SL/TP are now based on EQUITY ROI, not raw price movement
  // Formula: Required Price Move % = Target ROI % ÷ Leverage
  //
  // Example: 2% TP @ 10x leverage
  //   → Price needs to move 2% ÷ 10 = 0.2%
  //   → At $50,000: TP = $50,100 (only $100 move for 2% ROI on margin)
  //
  // This ensures SL/TP values match the ROI displayed in leveraged P&L %
  // ========================================================================
  
  const slPercent = (CONFIG.TRADING.INITIAL_SL_PERCENT / leverage) / 100;
  const tpPercent = (CONFIG.TRADING.INITIAL_TP_PERCENT / leverage) / 100;

  const stopLoss = side === 'long'
    ? entryPrice * (1 - slPercent)
    : entryPrice * (1 + slPercent);

  const takeProfit = side === 'long'
    ? entryPrice * (1 + tpPercent)
    : entryPrice * (1 - tpPercent);

  // Round to tick size and clean up floating point errors
  const tickSize = specs.tickSize;
  
  // Determine decimal places from tick size
  const decimals = tickSize.toString().split('.')[1]?.length || 0;
  
  const roundedEntry = parseFloat((Math.round(entryPrice / tickSize) * tickSize).toFixed(decimals));
  const roundedSL = parseFloat((Math.round(stopLoss / tickSize) * tickSize).toFixed(decimals));
  const roundedTP = parseFloat((Math.round(takeProfit / tickSize) * tickSize).toFixed(decimals));

  broadcastLog('info', `[${symbol}] Placing ${side.toUpperCase()} order...`);
  broadcastLog('info', `  Entry: ${roundedEntry.toFixed(5)} | Size: ${size} lots ($${actualPositionValueUSD.toFixed(2)} @ ${leverage}x)`);
  broadcastLog('info', `  Margin Used: $${actualMarginUsed.toFixed(2)} | Total Exposure: $${actualPositionValueUSD.toFixed(2)}`);
  broadcastLog('info', `  SL: ${roundedSL.toFixed(5)} (${CONFIG.TRADING.INITIAL_SL_PERCENT}% ROI = ${(slPercent * 100).toFixed(3)}% price) | TP: ${roundedTP.toFixed(5)} (${CONFIG.TRADING.INITIAL_TP_PERCENT}% ROI = ${(tpPercent * 100).toFixed(3)}% price)`);

  try {
    // Place entry order
    const entryParams = {
      clientOid: `entry_${symbol}_${Date.now()}`,
      side: side === 'long' ? 'buy' : 'sell',
      symbol: symbol,
      type: 'limit',
      price: roundedEntry.toString(),
      size: size.toString(),
      leverage: leverage.toString(),
      timeInForce: 'GTC'
    };

    broadcastLog('info', `  Order params: ${JSON.stringify(entryParams)}`);
    
    const entryResult = await kucoinAPI.placeOrder(entryParams);
    
    if (!entryResult.data || !entryResult.data.orderId) {
      throw new Error('No order ID returned from KuCoin');
    }

    const entryOrderId = entryResult.data.orderId;
    broadcastLog('success', `[${symbol}] Entry order placed: ${entryOrderId}`);

    // Place SL order
    const slSide = side === 'long' ? 'sell' : 'buy';
    const slParams = {
      clientOid: `sl_${symbol}_${Date.now()}`,
      side: slSide,
      symbol: symbol,
      type: 'market',
      stop: side === 'long' ? 'down' : 'up',
      stopPrice: roundedSL.toString(),
      stopPriceType: 'TP',
      size: size.toString(),
      reduceOnly: true
    };

    let slOrderId = null;
    try {
      const slResult = await kucoinAPI.placeStopOrder(slParams);
      if (slResult.data) {
        slOrderId = slResult.data.orderId;
        broadcastLog('success', `[${symbol}] SL order placed: ${slOrderId}`);
      }
    } catch (slError) {
      broadcastLog('warn', `[${symbol}] Failed to place SL order: ${slError.message}`);
    }

    // Place TP order
    const tpSide = side === 'long' ? 'sell' : 'buy';
    const tpParams = {
      clientOid: `tp_${symbol}_${Date.now()}`,
      side: tpSide,
      symbol: symbol,
      type: 'limit',
      price: roundedTP.toString(),
      size: size.toString(),
      reduceOnly: true,
      timeInForce: 'GTC'
    };

    let tpOrderId = null;
    try {
      const tpResult = await kucoinAPI.placeOrder(tpParams);
      if (tpResult.data) {
        tpOrderId = tpResult.data.orderId;
        broadcastLog('success', `[${symbol}] TP order placed: ${tpOrderId}`);
      }
    } catch (tpError) {
      broadcastLog('warn', `[${symbol}] Failed to place TP order: ${tpError.message}`);
    }

    // Create position manager
    const positionData = {
      symbol,
      side,
      size,
      leverage: leverage,
      entryPrice: roundedEntry,
      currentPrice: roundedEntry,
      positionValueUSD: actualPositionValueUSD,  // V3.4: Total exposure
      marginUsed: actualMarginUsed,              // V3.4: Margin required
      initialSL: roundedSL,
      currentSL: roundedSL,
      takeProfit: roundedTP,
      entryOrderId,
      slOrderId,
      tpOrderId,
      status: 'pending'
    };

    const manager = new PositionManager(positionData, kucoinAPI);
    activePositions.set(symbol, manager);
    savePositions();
    broadcastPositions();

    broadcastAlert('entry', `${symbol} ${side.toUpperCase()} entry placed @ ${roundedEntry.toFixed(2)}`);

    return {
      success: true,
      data: positionData
    };

  } catch (error) {
    const errorMsg = error.response?.data?.msg || error.message || 'Unknown error';
    const errorCode = error.response?.data?.code || 'N/A';
    broadcastLog('error', `[${symbol}] Order failed: ${errorMsg}`);
    broadcastLog('error', `  Error code: ${errorCode}`);
    if (error.response?.data) {
      broadcastLog('error', `  Full response: ${JSON.stringify(error.response.data)}`);
    }
    return { success: false, error: errorMsg };
  }
}

// ============================================================================
// WEBSOCKET HANDLERS
// ============================================================================
wss.on('connection', async (ws) => {
  console.log('[WS] Client connected');
  wsClients.add(ws);
  broadcastLog('success', 'Dashboard connected');

  // Send initial state
  broadcastInitialState(ws);

  // Fetch fresh balance
  await fetchAccountBalance();

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'place_order':
          await executeEntry(data.symbol, data.side, data.positionSize || CONFIG.TRADING.POSITION_SIZE_PERCENT, data.leverage || CONFIG.TRADING.DEFAULT_LEVERAGE);
          break;

        case 'close_position':
          const manager = activePositions.get(data.symbol);
          if (manager) {
            await manager.closePosition('Manual close');
          } else {
            broadcastLog('warn', `No position found for ${data.symbol}`);
          }
          break;

        case 'add_symbol':
          if (data.symbol && !marketManagers[data.symbol]) {
            await initializeSymbol(data.symbol.toUpperCase());
          } else if (marketManagers[data.symbol]) {
            broadcastLog('warn', `${data.symbol} already loaded`);
          }
          break;

        case 'remove_symbol':
          if (data.symbol && marketManagers[data.symbol]) {
            delete marketManagers[data.symbol];
            delete orderBooks[data.symbol];
            delete fundingRates[data.symbol];
            delete contractSpecs[data.symbol];
            broadcastLog('info', `Removed ${data.symbol}`);
            broadcastSymbolList();
          }
          break;

        case 'change_timeframe':
          if (CONFIG.TIMEFRAMES[data.timeframe]) {
            currentTimeframe = data.timeframe;
            broadcastLog('info', `Timeframe changed to ${data.timeframe}`);
            // Reload candles for all symbols
            for (const symbol of Object.keys(marketManagers)) {
              await fetchKlines(symbol, data.timeframe);
              broadcastMarketData(symbol);
            }
          }
          break;

        case 'get_balance':
          await fetchAccountBalance();
          break;

        case 'refresh_data':
          if (data.symbol) {
            await fetchTicker(data.symbol);
            await fetchOrderBook(data.symbol);
            broadcastMarketData(data.symbol);
          }
          break;
      }

    } catch (error) {
      broadcastLog('error', `Message error: ${error.message}`);
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
    wsClients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('[WS] Error:', error.message);
    wsClients.delete(ws);
  });
});

// ============================================================================
// HTTP API ENDPOINTS
// ============================================================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    symbols: Object.keys(marketManagers).length,
    positions: activePositions.size,
    clients: wsClients.size
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    symbols: Object.keys(marketManagers),
    positions: activePositions.size,
    balance: accountBalance,
    timeframe: currentTimeframe
  });
});

app.get('/api/symbols', (req, res) => {
  res.json({
    active: Object.keys(marketManagers),
    available: CONFIG.DEFAULT_SYMBOLS
  });
});

app.get('/api/market/:symbol', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  if (!marketManagers[symbol]) {
    return res.status(404).json({ error: 'Symbol not found' });
  }
  
  const manager = marketManagers[symbol];
  res.json({
    marketData: manager.getMarketData(),
    indicators: manager.getIndicators(),
    signal: manager.generateSignal(),
    orderBook: orderBooks[symbol],
    fundingRate: fundingRates[symbol]
  });
});

app.get('/api/positions', (req, res) => {
  const positions = [];
  for (const [symbol, manager] of activePositions.entries()) {
    positions.push(manager.toJSON());
  }
  res.json(positions);
});

app.post('/api/symbols/add', async (req, res) => {
  const { symbol } = req.body;
  if (!symbol) {
    return res.status(400).json({ error: 'Symbol required' });
  }
  
  const sym = symbol.toUpperCase();
  if (marketManagers[sym]) {
    return res.json({ success: true, message: 'Symbol already loaded' });
  }
  
  await initializeSymbol(sym);
  res.json({ success: true, symbol: sym });
});

app.post('/api/symbols/remove', (req, res) => {
  const { symbol } = req.body;
  if (!symbol) {
    return res.status(400).json({ error: 'Symbol required' });
  }
  
  const sym = symbol.toUpperCase();
  if (marketManagers[sym]) {
    delete marketManagers[sym];
    delete orderBooks[sym];
    delete fundingRates[sym];
  }
  res.json({ success: true });
});

app.post('/api/timeframe', async (req, res) => {
  const { timeframe } = req.body;
  if (!CONFIG.TIMEFRAMES[timeframe]) {
    return res.status(400).json({ error: 'Invalid timeframe' });
  }
  
  currentTimeframe = timeframe;
  
  for (const symbol of Object.keys(marketManagers)) {
    await fetchKlines(symbol, timeframe);
    broadcastMarketData(symbol);
  }
  
  broadcast({ type: 'timeframe_changed', timeframe });
  res.json({ success: true, timeframe });
});

app.post('/api/order', async (req, res) => {
  const { symbol, side, positionSize } = req.body;
  
  if (!symbol || !side) {
    return res.status(400).json({ error: 'Symbol and side required' });
  }
  
  const result = await executeEntry(symbol.toUpperCase(), side.toLowerCase(), positionSize);
  res.json(result);
});

app.post('/api/close', async (req, res) => {
  const { symbol } = req.body;
  
  if (!symbol) {
    return res.status(400).json({ error: 'Symbol required' });
  }
  
  const manager = activePositions.get(symbol.toUpperCase());
  if (!manager) {
    return res.status(404).json({ error: 'Position not found' });
  }
  
  await manager.closePosition('Manual close via API');
  res.json({ success: true });
});

app.get('/api/contracts', async (req, res) => {
  try {
    const response = await kucoinAPI.getContracts();
    const symbols = response.data
      .filter(c => c.quoteCurrency === 'USDT' && c.status === 'Open')
      .map(c => c.symbol)
      .sort();
    res.json(symbols);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// PERIODIC UPDATES
// ============================================================================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Update market data every 3 seconds
setInterval(async () => {
  for (const symbol of Object.keys(marketManagers)) {
    await fetchTicker(symbol);
    broadcastMarketData(symbol);
    await sleep(100);
  }
}, 3000);

// Update order books every 2 seconds
setInterval(async () => {
  for (const symbol of Object.keys(marketManagers)) {
    await fetchOrderBook(symbol);
    await sleep(100);
  }
}, 2000);

// Update positions every 1 second
setInterval(async () => {
  for (const [symbol, manager] of activePositions.entries()) {
    if (marketManagers[symbol]) {
      const price = marketManagers[symbol].currentPrice;
      if (price > 0) {
        await manager.updatePrice(price);
      }
    }
  }
  if (activePositions.size > 0) {
    broadcastPositions();
  }
}, 1000);

// Update balance every 30 seconds
setInterval(fetchAccountBalance, 30000);

// Update funding rates every 5 minutes
setInterval(async () => {
  for (const symbol of Object.keys(marketManagers)) {
    await fetchFundingRate(symbol);
    await sleep(100);
  }
}, 300000);

// Sync positions from KuCoin every minute
setInterval(async () => {
  try {
    const response = await kucoinAPI.getAllPositions();
    if (response.data) {
      for (const pos of response.data) {
        if (pos.currentQty !== 0) {
          const symbol = pos.symbol;
          const manager = activePositions.get(symbol);
          
          if (manager && manager.status === 'pending') {
            // Position filled, update status
            manager.status = 'open';
            manager.entryPrice = parseFloat(pos.avgEntryPrice);
            broadcastLog('success', `[${symbol}] Position filled @ ${manager.entryPrice}`);
            savePositions();
          }
        }
      }
    }
  } catch (error) {
    // Silently handle sync errors
  }
}, 60000);

// ============================================================================
// STARTUP
// ============================================================================
async function startup() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     KuCoin Perpetual Futures Dashboard v3.4.2                ║');
  console.log('║     Semi-Automated Trading System                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Test API connection
  console.log('[INIT] Testing API connection...');
  try {
    const timeRes = await kucoinAPI.getServerTime();
    console.log(`[INIT] ✓ Connected to KuCoin (Server time: ${new Date(timeRes.data).toISOString()})`);
  } catch (error) {
    console.error('[INIT] ✗ Failed to connect to KuCoin:', error.message);
    process.exit(1);
  }

  // Fetch account balance
  console.log('[INIT] Fetching account balance...');
  const balance = await fetchAccountBalance();
  if (balance) {
    console.log(`[INIT] ✓ Account Balance: ${parseFloat(balance.accountEquity).toFixed(2)} USDT`);
  }

  // Load saved positions
  console.log('[INIT] Loading saved positions...');
  loadPositions();
  console.log(`[INIT] ✓ Loaded ${activePositions.size} positions`);

  // Initialize market data
  await initializeAllSymbols();

  // Start server
  server.listen(CONFIG.PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log(`║     Dashboard: http://localhost:${CONFIG.PORT}                        ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('[READY] Waiting for dashboard connection...');
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[SHUTDOWN] Saving positions...');
  savePositions();
  console.log('[SHUTDOWN] Closing connections...');
  wsClients.forEach(ws => ws.close());
  server.close();
  console.log('[SHUTDOWN] Goodbye!');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('[FATAL]', error);
  savePositions();
});

// Start the server
startup().catch(error => {
  console.error('[STARTUP ERROR]', error);
  process.exit(1);
});
