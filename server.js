// ============================================================================
// KuCoin Perpetual Futures Dashboard - Semi-Automated Trading System
// Version: 3.4.2 - Production Ready
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
  
  TRADING: {
    INITIAL_SL_PERCENT: 0.5,
    INITIAL_TP_PERCENT: 2.0,
    BREAK_EVEN_TRIGGER: 0.001,
    TRAILING_STEP_PERCENT: 0.15,
    TRAILING_MOVE_PERCENT: 0.05,
    POSITION_SIZE_PERCENT: 0.5,
    DEFAULT_LEVERAGE: 10,
    MAX_POSITIONS: 5
  },
  
  DEFAULT_SYMBOLS: ['XBTUSDTM', 'ETHUSDTM', 'SOLUSDTM', 'BNBUSDTM', 'XRPUSDTM'],
  
  TIMEFRAMES: {
    '1min': 1, '5min': 5, '15min': 15, '30min': 30,
    '1hour': 60, '4hour': 240, '1day': 1440
  },
  
  POSITIONS_FILE: './positions.json'
};

// ============================================================================
// EXPRESS & WEBSOCKET SETUP
// ============================================================================
const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.get('/favicon.ico', (req, res) => res.status(204).end());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ============================================================================
// API CREDENTIALS
// ============================================================================
const KUCOIN_API_KEY = process.env.KUCOIN_API_KEY;
const KUCOIN_API_SECRET = process.env.KUCOIN_API_SECRET;
const KUCOIN_API_PASSPHRASE = process.env.KUCOIN_API_PASSPHRASE;

// Only enforce credentials when running as main (not during testing)
if (require.main === module && (!KUCOIN_API_KEY || !KUCOIN_API_SECRET || !KUCOIN_API_PASSPHRASE)) {
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
const marketManagers = {};
const activePositions = new Map();
const orderBooks = {};
const fundingRates = {};
const contractSpecs = {};
const wsClients = new Set();

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
        method, url, headers,
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

  async getServerTime() {
    const response = await axios.get(`${this.baseURL}/api/v1/timestamp`);
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

  async getAccountOverview(currency = 'USDT') {
    return this.request('GET', `/api/v1/account-overview?currency=${currency}`);
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

  async cancelStopOrder(orderId) {
    return this.request('DELETE', `/api/v1/stop-orders/${orderId}`);
  }

  async cancelAllStopOrders(symbol) {
    return this.request('DELETE', `/api/v1/stop-orders?symbol=${symbol}`);
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
    let gains = 0, losses = 0;
    for (let i = data.length - period; i < data.length; i++) {
      const change = data[i] - data[i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    return 100 - (100 / (1 + avgGain / avgLoss));
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

  static calculateMACD(data, fastPeriod = 12, slowPeriod = 26) {
    if (!data || data.length < slowPeriod) return { macd: 0, signal: 0, histogram: 0 };
    const fastEMA = this.calculateEMA(data, fastPeriod);
    const slowEMA = this.calculateEMA(data, slowPeriod);
    if (fastEMA === null || slowEMA === null) return { macd: 0, signal: 0, histogram: 0 };
    const macd = fastEMA - slowEMA;
    const signal = macd * 0.85;
    return { macd, signal, histogram: macd - signal };
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
    return { upper: sma + (stdDev * std), middle: sma, lower: sma - (stdDev * std) };
  }

  static calculateStochastic(highs, lows, closes, period = 14) {
    if (!closes || closes.length < period) return { k: 50, d: 50 };
    const recentHighs = highs.slice(-period);
    const recentLows = lows.slice(-period);
    const currentClose = closes[closes.length - 1];
    const highestHigh = Math.max(...recentHighs);
    const lowestLow = Math.min(...recentLows);
    if (highestHigh === lowestLow) return { k: 50, d: 50 };
    const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
    return { k, d: k * 0.8 };
  }
}

// ============================================================================
// SIGNAL GENERATOR
// ============================================================================
class SignalGenerator {
  static generate(indicators) {
    let score = 0;
    const breakdown = [];

    // RSI
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
      breakdown.push({ indicator: 'RSI', value: indicators.rsi.toFixed(1), contribution: 0, reason: 'Neutral', type: 'neutral' });
    }

    // Williams %R
    if (indicators.williamsR < -80) {
      score += 20;
      breakdown.push({ indicator: 'Williams %R', value: indicators.williamsR.toFixed(1), contribution: 20, reason: 'Oversold', type: 'bullish' });
    } else if (indicators.williamsR > -20) {
      score -= 20;
      breakdown.push({ indicator: 'Williams %R', value: indicators.williamsR.toFixed(1), contribution: -20, reason: 'Overbought', type: 'bearish' });
    } else {
      breakdown.push({ indicator: 'Williams %R', value: indicators.williamsR.toFixed(1), contribution: 0, reason: 'Neutral', type: 'neutral' });
    }

    // MACD
    if (indicators.macd > 0 && indicators.macdHistogram > 0) {
      score += 20;
      breakdown.push({ indicator: 'MACD', value: indicators.macd.toFixed(2), contribution: 20, reason: 'Bullish momentum', type: 'bullish' });
    } else if (indicators.macd < 0 && indicators.macdHistogram < 0) {
      score -= 20;
      breakdown.push({ indicator: 'MACD', value: indicators.macd.toFixed(2), contribution: -20, reason: 'Bearish momentum', type: 'bearish' });
    } else {
      breakdown.push({ indicator: 'MACD', value: indicators.macd.toFixed(2), contribution: 0, reason: 'Neutral', type: 'neutral' });
    }

    // AO
    if (indicators.ao > 0) {
      score += 15;
      breakdown.push({ indicator: 'AO', value: indicators.ao.toFixed(2), contribution: 15, reason: 'Positive', type: 'bullish' });
    } else {
      score -= 15;
      breakdown.push({ indicator: 'AO', value: indicators.ao.toFixed(2), contribution: -15, reason: 'Negative', type: 'bearish' });
    }

    // EMA Trend
    if (indicators.ema50 > indicators.ema200) {
      score += 20;
      breakdown.push({ indicator: 'EMA Trend', value: 'EMA50>EMA200', contribution: 20, reason: 'Bullish', type: 'bullish' });
    } else {
      score -= 20;
      breakdown.push({ indicator: 'EMA Trend', value: 'EMA50<EMA200', contribution: -20, reason: 'Bearish', type: 'bearish' });
    }

    // Determine signal type
    let type = 'NEUTRAL', confidence = 'LOW';
    if (score >= 70) { type = 'STRONG_BUY'; confidence = 'HIGH'; }
    else if (score >= 50) { type = 'BUY'; confidence = 'MEDIUM'; }
    else if (score >= 30) { type = 'BUY'; confidence = 'LOW'; }
    else if (score <= -70) { type = 'STRONG_SELL'; confidence = 'HIGH'; }
    else if (score <= -50) { type = 'SELL'; confidence = 'MEDIUM'; }
    else if (score <= -30) { type = 'SELL'; confidence = 'LOW'; }

    return { type, score, confidence, breakdown, timestamp: Date.now() };
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

  loadCandles(klineData) {
    if (!klineData || !Array.isArray(klineData)) return;
    this.candles = klineData.map(k => ({
      timestamp: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]),
      low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5])
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
        price: this.currentPrice, rsi: 50, williamsR: -50, atr: 0, ao: 0,
        macd: 0, macdSignal: 0, macdHistogram: 0, ema50: this.currentPrice,
        ema200: this.currentPrice, bollingerUpper: this.currentPrice,
        bollingerMiddle: this.currentPrice, bollingerLower: this.currentPrice,
        stochK: 50, stochD: 50
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
      macd: macdData.macd, macdSignal: macdData.signal, macdHistogram: macdData.histogram,
      ema50: TechnicalIndicators.calculateEMA(closes, 50) || this.currentPrice,
      ema200: TechnicalIndicators.calculateEMA(closes, Math.min(200, closes.length)) || this.currentPrice,
      bollingerUpper: bbData.upper, bollingerMiddle: bbData.middle, bollingerLower: bbData.lower,
      stochK: stochData.k, stochD: stochData.d
    };
  }

  generateSignal() { return SignalGenerator.generate(this.getIndicators()); }
  getMarketData() {
    return {
      symbol: this.symbol, price: this.currentPrice, priceChange24h: this.priceChange24h,
      volume24h: this.volume24h, bestBid: this.bestBid, bestAsk: this.bestAsk
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
    this.side = positionData.side;
    this.size = positionData.size;
    this.leverage = positionData.leverage || CONFIG.TRADING.DEFAULT_LEVERAGE;
    this.entryPrice = positionData.entryPrice;
    this.currentPrice = positionData.currentPrice || positionData.entryPrice;
    this.entryOrderId = positionData.entryOrderId || null;
    this.slOrderId = positionData.slOrderId || null;
    this.tpOrderId = positionData.tpOrderId || null;
    this.initialSL = positionData.initialSL;
    this.currentSL = positionData.currentSL || positionData.initialSL;
    this.takeProfit = positionData.takeProfit;
    this.breakEvenTriggered = positionData.breakEvenTriggered || false;
    this.lastTrailingLevel = positionData.lastTrailingLevel || 0;
    this.unrealizedPnl = 0;
    this.unrealizedPnlPercent = 0;
    this.openedAt = positionData.openedAt || Date.now();
    this.updatedAt = Date.now();
    this.status = positionData.status || 'pending';
  }

  async updatePrice(currentPrice) {
    this.currentPrice = currentPrice;
    this.updatedAt = Date.now();
    const priceDiff = this.side === 'long' ? (currentPrice - this.entryPrice) : (this.entryPrice - currentPrice);
    this.unrealizedPnl = priceDiff * this.size * this.leverage;
    this.unrealizedPnlPercent = (priceDiff / this.entryPrice) * 100;
    return this.toJSON();
  }

  toJSON() {
    return {
      symbol: this.symbol, side: this.side, size: this.size, leverage: this.leverage,
      entryPrice: this.entryPrice, currentPrice: this.currentPrice,
      initialSL: this.initialSL, currentSL: this.currentSL, takeProfit: this.takeProfit,
      unrealizedPnl: this.unrealizedPnl, unrealizedPnlPercent: this.unrealizedPnlPercent,
      breakEvenTriggered: this.breakEvenTriggered, lastTrailingLevel: this.lastTrailingLevel,
      status: this.status, openedAt: this.openedAt, updatedAt: this.updatedAt
    };
  }
}

// ============================================================================
// BROADCAST FUNCTIONS
// ============================================================================
function broadcast(message) {
  const str = JSON.stringify(message);
  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(str);
  });
}

function broadcastLog(type, message) {
  console.log(`[${type.toUpperCase()}] ${message}`);
  broadcast({ type: 'log', log: { timestamp: new Date().toISOString(), type, message } });
}

function broadcastAlert(alertType, message) {
  broadcast({ type: 'alert', alertType, message, timestamp: Date.now() });
}

function broadcastMarketData(symbol) {
  if (!marketManagers[symbol]) return;
  const manager = marketManagers[symbol];
  broadcast({
    type: 'market_update', symbol,
    marketData: manager.getMarketData(),
    indicators: manager.getIndicators(),
    signal: manager.generateSignal(),
    orderBook: orderBooks[symbol] || { bids: [], asks: [] },
    fundingRate: fundingRates[symbol] || { rate: 0 },
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

function broadcastSymbolList() {
  broadcast({ type: 'symbols_updated', symbols: Object.keys(marketManagers) });
}

function broadcastInitialState(ws) {
  const symbols = Object.keys(marketManagers);
  const marketData = {}, indicators = {}, signals = {};
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
    type: 'initial_state', symbols, marketData, indicators, signals, orderBooks, fundingRates,
    positions, accountBalance, config: { trading: CONFIG.TRADING, timeframes: Object.keys(CONFIG.TIMEFRAMES), currentTimeframe }
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
        maxLeverage: response.data.maxLeverage
      };
    }
  } catch (error) {
    broadcastLog('warn', `Failed to fetch contract specs for ${symbol}`);
  }
}

async function fetchKlines(symbol, timeframe = currentTimeframe) {
  try {
    const granularity = CONFIG.TIMEFRAMES[timeframe] || 5;
    const to = Date.now();
    const from = to - (granularity * 500 * 60 * 1000);
    const response = await kucoinAPI.getKlines(symbol, granularity, from, to);
    if (response.data && response.data.length > 0) {
      if (!marketManagers[symbol]) marketManagers[symbol] = new MarketDataManager(symbol);
      marketManagers[symbol].loadCandles(response.data);
      return response.data.length;
    }
    return 0;
  } catch (error) {
    broadcastLog('error', `Failed to fetch klines for ${symbol}`);
    return 0;
  }
}

async function fetchTicker(symbol) {
  try {
    const response = await kucoinAPI.getTicker(symbol);
    if (response.data) {
      if (!marketManagers[symbol]) marketManagers[symbol] = new MarketDataManager(symbol);
      marketManagers[symbol].updateTicker(response.data);
    }
  } catch (error) {
    broadcastLog('error', `Failed to fetch ticker for ${symbol}`);
  }
}

async function fetchOrderBook(symbol) {
  try {
    const response = await kucoinAPI.getOrderBook(symbol, 20);
    if (response.data) {
      orderBooks[symbol] = { bids: response.data.bids || [], asks: response.data.asks || [], timestamp: Date.now() };
    }
  } catch (error) {
    broadcastLog('error', `Failed to fetch order book for ${symbol}`);
  }
}

async function fetchFundingRate(symbol) {
  try {
    const response = await kucoinAPI.getFundingRate(symbol);
    if (response.data) {
      fundingRates[symbol] = { rate: parseFloat(response.data.value), timestamp: Date.now() };
    }
  } catch (error) {}
}

async function fetchAccountBalance() {
  try {
    const response = await kucoinAPI.getAccountOverview('USDT');
    if (response.data) broadcastBalance(response.data);
  } catch (error) {
    broadcastLog('error', `Failed to fetch balance`);
  }
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function initializeSymbol(symbol) {
  broadcastLog('info', `Initializing ${symbol}...`);
  if (!marketManagers[symbol]) marketManagers[symbol] = new MarketDataManager(symbol);
  await fetchContractSpecs(symbol);
  const candleCount = await fetchKlines(symbol);
  await fetchTicker(symbol);
  await fetchOrderBook(symbol);
  await fetchFundingRate(symbol);
  broadcastLog('success', `${symbol}: Loaded ${candleCount} candles`);
  broadcastMarketData(symbol);
  broadcastSymbolList();
}

async function initializeAllSymbols() {
  broadcastLog('info', 'Initializing market data...');
  for (const symbol of CONFIG.DEFAULT_SYMBOLS) {
    await initializeSymbol(symbol);
    await sleep(200);
  }
  broadcastLog('success', 'All symbols initialized');
}

// ============================================================================
// POSITION PERSISTENCE
// ============================================================================
function savePositions() {
  try {
    const data = {};
    for (const [symbol, manager] of activePositions.entries()) data[symbol] = manager.toJSON();
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
          activePositions.set(symbol, new PositionManager(posData, kucoinAPI));
          broadcastLog('info', `[RESTORE] Loaded position: ${symbol}`);
        }
      }
    }
  } catch (error) {
    console.error('[LOAD ERROR]', error.message);
  }
}

// ============================================================================
// ORDER EXECUTION
// ============================================================================
async function executeEntry(symbol, side, positionSizePercent = CONFIG.TRADING.POSITION_SIZE_PERCENT, leverage = CONFIG.TRADING.DEFAULT_LEVERAGE) {
  if (activePositions.size >= CONFIG.TRADING.MAX_POSITIONS) {
    broadcastLog('error', `Max positions reached`);
    return { success: false, error: 'Max positions reached' };
  }
  if (activePositions.has(symbol)) {
    broadcastLog('error', `Already have position in ${symbol}`);
    return { success: false, error: 'Position exists' };
  }

  await fetchOrderBook(symbol);
  const orderBook = orderBooks[symbol];
  if (!orderBook || orderBook.bids.length < 10 || orderBook.asks.length < 10) {
    return { success: false, error: 'No order book data' };
  }

  const entryPrice = side === 'long' ? parseFloat(orderBook.bids[8][0]) : parseFloat(orderBook.asks[8][0]);
  const specs = contractSpecs[symbol];
  if (!specs) return { success: false, error: 'No contract specs' };

  const positionValue = accountBalance * (positionSizePercent / 100) * leverage;
  const contractValue = entryPrice * specs.multiplier;
  const size = Math.floor(positionValue / contractValue);
  if (size < 1) return { success: false, error: 'Position size too small' };

  const slPercent = CONFIG.TRADING.INITIAL_SL_PERCENT / 100;
  const tpPercent = CONFIG.TRADING.INITIAL_TP_PERCENT / 100;
  const stopLoss = side === 'long' ? entryPrice * (1 - slPercent) : entryPrice * (1 + slPercent);
  const takeProfit = side === 'long' ? entryPrice * (1 + tpPercent) : entryPrice * (1 - tpPercent);
  const tickSize = specs.tickSize;
  const roundedEntry = Math.round(entryPrice / tickSize) * tickSize;
  const roundedSL = Math.round(stopLoss / tickSize) * tickSize;
  const roundedTP = Math.round(takeProfit / tickSize) * tickSize;

  broadcastLog('info', `[${symbol}] Placing ${side.toUpperCase()} @ ${roundedEntry.toFixed(2)}`);

  try {
    const entryResult = await kucoinAPI.placeOrder({
      clientOid: `entry_${symbol}_${Date.now()}`,
      side: side === 'long' ? 'buy' : 'sell',
      symbol, type: 'limit', price: roundedEntry.toString(),
      size: size.toString(), leverage: leverage.toString(), timeInForce: 'GTC'
    });

    if (!entryResult.data?.orderId) throw new Error('No order ID');
    broadcastLog('success', `[${symbol}] Entry placed: ${entryResult.data.orderId}`);

    const manager = new PositionManager({
      symbol, side, size, leverage, entryPrice: roundedEntry,
      initialSL: roundedSL, currentSL: roundedSL, takeProfit: roundedTP,
      entryOrderId: entryResult.data.orderId, status: 'pending'
    }, kucoinAPI);

    activePositions.set(symbol, manager);
    savePositions();
    broadcastPositions();
    broadcastAlert('entry', `${symbol} ${side.toUpperCase()} entry placed`);

    return { success: true, data: manager.toJSON() };
  } catch (error) {
    broadcastLog('error', `[${symbol}] Order failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// WEBSOCKET HANDLERS
// ============================================================================
wss.on('connection', async (ws) => {
  console.log('[WS] Client connected');
  wsClients.add(ws);
  broadcastLog('success', 'Dashboard connected');
  broadcastInitialState(ws);
  await fetchAccountBalance();

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      switch (data.type) {
        case 'place_order':
          await executeEntry(data.symbol, data.side, data.positionSize, data.leverage);
          break;
        case 'close_position':
          const manager = activePositions.get(data.symbol);
          if (manager) {
            activePositions.delete(data.symbol);
            savePositions();
            broadcastPositions();
            broadcastLog('info', `Closed ${data.symbol}`);
          }
          break;
        case 'add_symbol':
          if (data.symbol && !marketManagers[data.symbol]) {
            await initializeSymbol(data.symbol.toUpperCase());
          }
          break;
        case 'remove_symbol':
          if (marketManagers[data.symbol]) {
            delete marketManagers[data.symbol];
            delete orderBooks[data.symbol];
            broadcastSymbolList();
          }
          break;
        case 'change_timeframe':
          if (CONFIG.TIMEFRAMES[data.timeframe]) {
            currentTimeframe = data.timeframe;
            for (const symbol of Object.keys(marketManagers)) {
              await fetchKlines(symbol, data.timeframe);
              broadcastMarketData(symbol);
            }
          }
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

  ws.on('close', () => { wsClients.delete(ws); });
  ws.on('error', () => { wsClients.delete(ws); });
});

// ============================================================================
// HTTP ENDPOINTS
// ============================================================================
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), symbols: Object.keys(marketManagers).length, positions: activePositions.size });
});

app.get('/api/status', (req, res) => {
  res.json({ status: 'online', symbols: Object.keys(marketManagers), positions: activePositions.size, balance: accountBalance });
});

app.get('/api/positions', (req, res) => {
  const positions = [];
  for (const [symbol, manager] of activePositions.entries()) positions.push(manager.toJSON());
  res.json(positions);
});

// ============================================================================
// PERIODIC UPDATES
// ============================================================================
setInterval(async () => {
  for (const symbol of Object.keys(marketManagers)) {
    await fetchTicker(symbol);
    broadcastMarketData(symbol);
    await sleep(100);
  }
}, 3000);

setInterval(async () => {
  for (const symbol of Object.keys(marketManagers)) {
    await fetchOrderBook(symbol);
    await sleep(100);
  }
}, 2000);

setInterval(async () => {
  for (const [symbol, manager] of activePositions.entries()) {
    if (marketManagers[symbol]) {
      await manager.updatePrice(marketManagers[symbol].currentPrice);
    }
  }
  if (activePositions.size > 0) broadcastPositions();
}, 1000);

setInterval(fetchAccountBalance, 30000);

// ============================================================================
// STARTUP
// ============================================================================
async function startup() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║     KuCoin Perpetual Futures Dashboard v3.4.2                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  try {
    const timeRes = await kucoinAPI.getServerTime();
    console.log(`[INIT] Connected to KuCoin (${new Date(timeRes.data).toISOString()})`);
  } catch (error) {
    console.error('[INIT] Failed to connect:', error.message);
    process.exit(1);
  }

  await fetchAccountBalance();
  loadPositions();
  await initializeAllSymbols();

  server.listen(CONFIG.PORT, () => {
    console.log(`\n[READY] Dashboard: http://localhost:${CONFIG.PORT}\n`);
  });
}

process.on('SIGINT', () => { savePositions(); process.exit(0); });
process.on('uncaughtException', (error) => { console.error('[FATAL]', error); savePositions(); });

// Only start server when run directly (not when imported for testing)
if (require.main === module) {
  startup().catch(error => { console.error('[STARTUP ERROR]', error); process.exit(1); });
}

// Export for testing
module.exports = { TechnicalIndicators, SignalGenerator, MarketDataManager, CONFIG };
