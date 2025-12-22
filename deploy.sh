#!/bin/bash

# V3.4.2 DEPLOYMENT SCRIPT
# Gets your trading system running in 60 seconds

echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║   KuCoin Futures v3.4.2 - Quick Deploy        ║"
echo "╚════════════════════════════════════════════════╝"
echo ""

# 1. Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not installed!"
    echo "Install from: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js: $(node -v)"
echo "✅ NPM: $(npm -v)"
echo ""

# 2. Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Installation failed!"
    exit 1
fi

echo "✅ Dependencies installed"
echo ""

# 3. Check .env file
if [ ! -f .env ]; then
    echo "⚠️  No .env file found!"
    echo ""
    echo "Create .env file with:"
    echo "  KUCOIN_API_KEY=your_key"
    echo "  KUCOIN_API_SECRET=your_secret"
    echo "  KUCOIN_API_PASSPHRASE=your_passphrase"
    echo ""
    echo "Then run: npm start"
    exit 1
fi

echo "✅ .env file exists"
echo ""

# 4. Create public folder if missing
if [ ! -d public ]; then
    mkdir public
    if [ -f index.html ]; then
        mv index.html public/
        echo "✅ Moved index.html to public/"
    fi
fi

# 5. Start server
echo "╔════════════════════════════════════════════════╗"
echo "║         READY TO TRADE!                        ║"
echo "╚════════════════════════════════════════════════╝"
echo ""
echo "Starting server..."
echo ""
npm start
