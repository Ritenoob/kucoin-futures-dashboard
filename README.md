# KuCoin Futures Dashboard

A semi-automated trading dashboard for KuCoin Perpetual Futures with real-time signal generation, position management, and automated trailing stops.

## Features

- **Real-time Market Data**: Live price feeds, order books, and funding rates
- **Technical Indicators**: RSI, Williams %R, MACD, ATR, Bollinger Bands, EMA, Stochastic
- **Signal Generator**: Weighted scoring system (-100 to +100) with confidence levels
- **Position Management**: Automated break-even and trailing stop logic
- **Multi-Symbol Support**: Track multiple futures contracts simultaneously
- **WebSocket Updates**: Real-time dashboard updates via WebSocket

## Quick Start

### Prerequisites

- Node.js >= 16.0.0
- KuCoin Futures API credentials

### Installation

```bash
# Clone the repository
git clone https://github.com/Ritenoob/kucoin-futures-dashboard.git
cd kucoin-futures-dashboard

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your KuCoin API credentials
```

### Configuration

Create a `.env` file with your KuCoin Futures API credentials:

```env
KUCOIN_API_KEY=your_api_key_here
KUCOIN_API_SECRET=your_api_secret_here
KUCOIN_API_PASSPHRASE=your_passphrase_here
PORT=3001
```

### Running

```bash
# Start the server
npm start

# Development mode with auto-reload
npm run dev
```

Then open http://localhost:3001 in your browser.

## Trading Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| Initial Stop Loss | 0.5% | Below entry price |
| Initial Take Profit | 2.0% | Above entry (4:1 R:R) |
| Break-Even Trigger | Any profit > 0 | Moves SL to entry |
| Trailing Step | 0.15% | Profit increment |
| Trailing Move | 0.05% | SL adjustment |
| Position Size | 0.5% | Of account balance |
| Default Leverage | 10x | Configurable 1-100x |
| Max Positions | 5 | Concurrent positions |

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

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/status` | GET | System status |
| `/api/positions` | GET | Active positions |

## Project Structure

```
├── server.js           # Main server application
├── public/
│   └── index.html      # Dashboard UI
├── signal-weights.js   # Signal weight configuration
├── verify.js           # System verification script
├── package.json
├── .env.example
└── README.md
```

## Testing

```bash
npm test
```

## Security

⚠️ **Important**: Never commit your API credentials. Always use environment variables.

- API credentials are loaded from `.env` file
- `.gitignore` excludes sensitive files
- HMAC signature authentication for KuCoin API

## License

MIT

## Disclaimer

This software is for educational purposes only. Trading cryptocurrencies involves significant risk. Use at your own risk.
