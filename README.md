# KuCoin Perpetual Futures Dashboard

[![CI](https://github.com/Ritenoob/kucoin-futures-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/Ritenoob/kucoin-futures-dashboard/actions/workflows/ci.yml)

A semi-automated trading dashboard for KuCoin Perpetual Futures with real-time signal generation, automated break-even, and trailing stop management.

## Features

- **Real-time Signal Generator**: -100 to +100 scoring based on 8 technical indicators
- **Multi-timeframe Analysis**: 1min, 5min, 15min, 30min, 1hour, 4hour, 1day
- **Automated Risk Management**:
  - Break-even trigger on any profit
  - Trailing stop with 0.15% step / 0.05% move
  - 4:1 Risk/Reward ratio (0.5% SL / 2% TP)
- **9th Level Order Book Entry**: Precise limit order placement
- **Position Management**: Up to 5 concurrent positions with persistence
- **WebSocket Real-time Updates**: Live price and indicator streaming

## Technical Indicators

| Indicator | Period | Max Points |
|-----------|--------|------------|
| RSI | 14 | ±25 |
| Williams %R | 14 | ±20 |
| MACD | 12/26/9 | ±20 |
| Awesome Oscillator | 5/34 | ±15 |
| EMA Trend | 50/200 | ±20 |
| Stochastic | 14 | ±10 |
| Bollinger Bands | 20, 2σ | ±10 |
| ATR | 14 | Volatility measure |

## Signal Scoring

| Score Range | Signal | Confidence |
|-------------|--------|------------|
| +70 to +100 | STRONG BUY | HIGH |
| +50 to +69 | BUY | MEDIUM |
| +30 to +49 | BUY | LOW |
| -29 to +29 | NEUTRAL | - |
| -30 to -49 | SELL | LOW |
| -50 to -69 | SELL | MEDIUM |
| -70 to -100 | STRONG SELL | HIGH |

## Quick Start

### Prerequisites

- Node.js 18 or higher
- KuCoin Futures API keys (optional for demo mode)

### Installation

```bash
# Clone the repository
git clone https://github.com/Ritenoob/kucoin-futures-dashboard.git
cd kucoin-futures-dashboard

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API credentials (optional)

# Start the server
npm start
```

### Demo Mode

The dashboard runs in demo mode without API credentials. Market data is fetched from public endpoints, but trading is simulated.

### Live Trading

1. Create API keys at [KuCoin](https://www.kucoin.com/account/api)
2. Enable **Futures Trading** permission
3. Configure your `.env` file:

```env
KUCOIN_API_KEY=your_api_key
KUCOIN_API_SECRET=your_api_secret
KUCOIN_API_PASSPHRASE=your_passphrase
PORT=3001
```

## Configuration

### Trading Parameters

Edit `CONFIG.TRADING` in `server.js`:

```javascript
TRADING: {
  INITIAL_SL_PERCENT: 0.5,        // Stop loss %
  INITIAL_TP_PERCENT: 2.0,        // Take profit %
  BREAK_EVEN_TRIGGER: 0.001,      // Break-even trigger
  TRAILING_STEP_PERCENT: 0.15,    // Trailing step
  TRAILING_MOVE_PERCENT: 0.05,    // SL move per step
  POSITION_SIZE_PERCENT: 0.5,     // Position size
  DEFAULT_LEVERAGE: 10,           // Default leverage
  MAX_POSITIONS: 5                // Max concurrent positions
}
```

### Default Symbols

```javascript
DEFAULT_SYMBOLS: ['XBTUSDTM', 'ETHUSDTM', 'SOLUSDTM', 'BNBUSDTM', 'XRPUSDTM']
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check with status |
| `/api/status` | GET | System status overview |
| `/api/symbols` | GET | List active symbols |
| `/api/market/:symbol` | GET | Market data for symbol |
| `/api/positions` | GET | Active positions |
| `/api/symbols/add` | POST | Add symbol to watchlist |
| `/api/order` | POST | Place order |
| `/api/close` | POST | Close position |

## Development

```bash
# Run tests
npm test

# Run with auto-reload
npm run dev

# Verify system
npm run verify
```

## Project Structure

```
kucoin-futures-dashboard/
├── server.js           # Main server with trading logic
├── server.test.js      # Unit tests
├── public/
│   └── index.html      # Dashboard UI
├── signal-weights.js   # Signal weight configuration
├── verify.js           # System verification script
├── .env.example        # Environment template
├── .github/
│   └── workflows/
│       └── ci.yml      # GitHub Actions CI
└── package.json
```

## Security

- **Never commit API credentials** - Use `.env` file
- API credentials file is in `.gitignore`
- Demo mode available for testing

## Troubleshooting

### "Cannot connect to KuCoin"
- Check API credentials in `.env`
- Verify Futures trading is enabled on API key

### "Position size too small"
- Increase position size percentage
- Increase leverage
- Ensure sufficient balance

### Dashboard not loading
- Check if server is running: `curl http://localhost:3001/health`
- Check console for errors

## Release Notes

### v3.4.2
- Production-ready implementation
- Comprehensive test suite
- CI/CD pipeline
- Demo mode support
- Enhanced error handling and logging

## License

MIT

## Disclaimer

This software is for educational purposes only. Trading cryptocurrencies involves significant risk. Use at your own risk. The authors are not responsible for any financial losses.
