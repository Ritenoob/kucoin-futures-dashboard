#!/usr/bin/env node
/**
 * SIGNAL WEIGHT ADJUSTMENT TOOL
 * Interactive tool to test and adjust indicator weights
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const configPath = path.join(__dirname, 'signal-weights.js');

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║     Signal Weight Adjustment Tool            ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  // Load current config
  delete require.cache[require.resolve('./signal-weights.js')];
  const config = require('./signal-weights.js');

  while (true) {
    console.log('\n📊 CURRENT CONFIGURATION:\n');
    
    const activeProfile = config.activeProfile;
    const weights = activeProfile === 'default' 
      ? config.weights 
      : config.profiles[activeProfile];

    console.log(`Active Profile: ${activeProfile.toUpperCase()}\n`);
    console.log('Indicator Weights:');
    console.log('─'.repeat(50));
    console.log(`  RSI:              ${weights.rsi.max} points`);
    console.log(`  Williams %R:      ${weights.williamsR.max} points`);
    console.log(`  MACD:             ${weights.macd.max} points`);
    console.log(`  Awesome Osc:      ${weights.ao.max} points`);
    console.log(`  EMA Trend:        ${weights.emaTrend.max} points`);
    console.log(`  Stochastic:       ${weights.stochastic.max} points`);
    console.log(`  Bollinger Bands:  ${weights.bollinger.max} points`);
    console.log('─'.repeat(50));
    
    const total = weights.rsi.max + weights.williamsR.max + weights.macd.max + 
                  weights.ao.max + weights.emaTrend.max + weights.stochastic.max + 
                  weights.bollinger.max;
    console.log(`  TOTAL:            ${total} points\n`);

    console.log('Signal Thresholds:');
    console.log('─'.repeat(50));
    console.log(`  STRONG_BUY:   ≥ ${config.thresholds.strongBuy}`);
    console.log(`  BUY:          ≥ ${config.thresholds.buy}`);
    console.log(`  BUY (weak):   ≥ ${config.thresholds.buyWeak}`);
    console.log(`  NEUTRAL:      ${config.thresholds.sellWeak} to ${config.thresholds.buyWeak}`);
    console.log(`  SELL (weak):  ≤ ${config.thresholds.sellWeak}`);
    console.log(`  SELL:         ≤ ${config.thresholds.sell}`);
    console.log(`  STRONG_SELL:  ≤ ${config.thresholds.strongSell}`);
    console.log('─'.repeat(50) + '\n');

    console.log('Available Actions:');
    console.log('  1. Switch profile');
    console.log('  2. Adjust individual weights');
    console.log('  3. Adjust thresholds');
    console.log('  4. Create custom profile');
    console.log('  5. Test with sample data');
    console.log('  6. Save and exit');
    console.log('  7. Exit without saving\n');

    const action = await question('Select action (1-7): ');

    switch (action.trim()) {
      case '1':
        await switchProfile(config);
        break;
      case '2':
        await adjustWeights(config);
        break;
      case '3':
        await adjustThresholds(config);
        break;
      case '4':
        await createCustomProfile(config);
        break;
      case '5':
        await testWithSampleData(config);
        break;
      case '6':
        await saveConfig(config);
        console.log('\n✅ Configuration saved! Restart server to apply changes.\n');
        rl.close();
        return;
      case '7':
        console.log('\n❌ Exiting without saving...\n');
        rl.close();
        return;
      default:
        console.log('\n❌ Invalid option. Try again.\n');
    }
  }
}

async function switchProfile(config) {
  console.log('\n📋 Available Profiles:\n');
  console.log('  0. default      - Original v3.4.2 weights');
  console.log('  1. conservative - Favor trend indicators');
  console.log('  2. aggressive   - Favor momentum indicators');
  console.log('  3. balanced     - Equal distribution');
  console.log('  4. scalping     - Quick signals, tight levels');
  console.log('  5. swingTrading - Longer timeframes\n');

  const choice = await question('Select profile (0-5): ');
  
  const profiles = ['default', 'conservative', 'aggressive', 'balanced', 'scalping', 'swingTrading'];
  const idx = parseInt(choice.trim());
  
  if (idx >= 0 && idx < profiles.length) {
    config.activeProfile = profiles[idx];
    console.log(`\n✅ Switched to '${profiles[idx]}' profile\n`);
  } else {
    console.log('\n❌ Invalid choice\n');
  }
}

async function adjustWeights(config) {
  const activeProfile = config.activeProfile;
  const weights = activeProfile === 'default' 
    ? config.weights 
    : config.profiles[activeProfile];

  console.log('\n⚙️  Adjust Individual Weights:\n');
  console.log('  1. RSI');
  console.log('  2. Williams %R');
  console.log('  3. MACD');
  console.log('  4. Awesome Oscillator');
  console.log('  5. EMA Trend');
  console.log('  6. Stochastic');
  console.log('  7. Bollinger Bands');
  console.log('  8. Back\n');

  const choice = await question('Select indicator (1-8): ');

  const indicators = ['rsi', 'williamsR', 'macd', 'ao', 'emaTrend', 'stochastic', 'bollinger'];
  const idx = parseInt(choice.trim()) - 1;

  if (idx === 7) return;

  if (idx >= 0 && idx < 7) {
    const indicator = indicators[idx];
    const currentMax = weights[indicator].max;
    
    const newMax = await question(`Current max points: ${currentMax}. Enter new value: `);
    const value = parseInt(newMax.trim());
    
    if (!isNaN(value) && value >= 0 && value <= 100) {
      weights[indicator].max = value;
      console.log(`\n✅ ${indicator} max points set to ${value}\n`);
    } else {
      console.log('\n❌ Invalid value (must be 0-100)\n');
    }
  }
}

async function adjustThresholds(config) {
  console.log('\n⚙️  Adjust Signal Thresholds:\n');
  
  console.log(`Current thresholds:`);
  console.log(`  STRONG_BUY:   ${config.thresholds.strongBuy}`);
  console.log(`  BUY:          ${config.thresholds.buy}`);
  console.log(`  BUY (weak):   ${config.thresholds.buyWeak}`);
  console.log(`  SELL (weak):  ${config.thresholds.sellWeak}`);
  console.log(`  SELL:         ${config.thresholds.sell}`);
  console.log(`  STRONG_SELL:  ${config.thresholds.strongSell}\n`);

  const adjust = await question('Adjust thresholds? (y/n): ');
  if (adjust.toLowerCase() !== 'y') return;

  const strongBuy = await question('STRONG_BUY threshold (current: ' + config.thresholds.strongBuy + '): ');
  const buy = await question('BUY threshold (current: ' + config.thresholds.buy + '): ');
  const buyWeak = await question('BUY weak threshold (current: ' + config.thresholds.buyWeak + '): ');
  
  if (strongBuy) config.thresholds.strongBuy = parseInt(strongBuy);
  if (buy) config.thresholds.buy = parseInt(buy);
  if (buyWeak) config.thresholds.buyWeak = parseInt(buyWeak);
  
  const sellWeak = await question('SELL weak threshold (current: ' + config.thresholds.sellWeak + '): ');
  const sell = await question('SELL threshold (current: ' + config.thresholds.sell + '): ');
  const strongSell = await question('STRONG_SELL threshold (current: ' + config.thresholds.strongSell + '): ');
  
  if (sellWeak) config.thresholds.sellWeak = parseInt(sellWeak);
  if (sell) config.thresholds.sell = parseInt(sell);
  if (strongSell) config.thresholds.strongSell = parseInt(strongSell);
  
  console.log('\n✅ Thresholds updated\n');
}

async function createCustomProfile(config) {
  console.log('\n🎨 Create Custom Profile\n');
  
  const name = await question('Profile name: ');
  if (!name || name.trim() === '') {
    console.log('\n❌ Invalid name\n');
    return;
  }
  
  console.log('\nEnter max points for each indicator (or press Enter to use defaults):\n');
  
  const custom = {
    rsi: { max: parseInt(await question('RSI (default 25): ') || '25'), oversold: 30, oversoldMild: 40, overbought: 70, overboughtMild: 60 },
    williamsR: { max: parseInt(await question('Williams %R (default 20): ') || '20'), oversold: -80, overbought: -20 },
    macd: { max: parseInt(await question('MACD (default 20): ') || '20') },
    ao: { max: parseInt(await question('Awesome Oscillator (default 15): ') || '15') },
    emaTrend: { max: parseInt(await question('EMA Trend (default 20): ') || '20') },
    stochastic: { max: parseInt(await question('Stochastic (default 10): ') || '10'), oversold: 20, overbought: 80 },
    bollinger: { max: parseInt(await question('Bollinger Bands (default 10): ') || '10') }
  };
  
  config.profiles[name.trim()] = custom;
  console.log(`\n✅ Custom profile '${name.trim()}' created!\n`);
  console.log(`To use it, switch to this profile or set activeProfile = '${name.trim()}' in config\n`);
}

async function testWithSampleData(config) {
  console.log('\n🧪 Test With Sample Market Data\n');
  
  // Load the configurable SignalGenerator
  const SignalGenerator = require('./SignalGenerator-configurable.js');
  
  // Sample bullish scenario
  const bullishData = {
    rsi: 28,           // Oversold
    williamsR: -82,    // Oversold
    macd: 15,          // Positive
    macdHistogram: 5,  // Positive
    ao: 10,            // Positive
    ema50: 50100,      // Above EMA200
    ema200: 50000,
    stochK: 18,        // Oversold
    stochD: 20,        // Below K
    price: 49800,
    bollingerLower: 49850,  // Below lower band
    bollingerUpper: 51000
  };
  
  // Sample bearish scenario
  const bearishData = {
    rsi: 75,           // Overbought
    williamsR: -15,    // Overbought
    macd: -12,         // Negative
    macdHistogram: -3, // Negative
    ao: -8,            // Negative
    ema50: 49900,      // Below EMA200
    ema200: 50000,
    stochK: 85,        // Overbought
    stochD: 80,        // Above K
    price: 51100,
    bollingerLower: 49000,
    bollingerUpper: 51000  // Above upper band
  };
  
  const bullishSignal = SignalGenerator.generate(bullishData);
  const bearishSignal = SignalGenerator.generate(bearishData);
  
  console.log('BULLISH Scenario:');
  console.log('─'.repeat(50));
  console.log(`Signal: ${bullishSignal.type} (${bullishSignal.confidence})`);
  console.log(`Score: ${bullishSignal.score}`);
  console.log(`Profile: ${bullishSignal.profile}\n`);
  console.log('Breakdown:');
  bullishSignal.breakdown.forEach(b => {
    console.log(`  ${b.indicator.padEnd(15)} ${b.contribution.toString().padStart(4)} pts - ${b.reason}`);
  });
  
  console.log('\n');
  
  console.log('BEARISH Scenario:');
  console.log('─'.repeat(50));
  console.log(`Signal: ${bearishSignal.type} (${bearishSignal.confidence})`);
  console.log(`Score: ${bearishSignal.score}`);
  console.log(`Profile: ${bearishSignal.profile}\n`);
  console.log('Breakdown:');
  bearishSignal.breakdown.forEach(b => {
    console.log(`  ${b.indicator.padEnd(15)} ${b.contribution.toString().padStart(4)} pts - ${b.reason}`);
  });
  
  console.log('\n');
  await question('Press Enter to continue...');
}

async function saveConfig(config) {
  const configStr = `/**
 * SIGNAL WEIGHTS CONFIGURATION
 * Adjust indicator importance here
 * Total points should add up to ~100-120
 */

module.exports = ${JSON.stringify(config, null, 2)};
`;

  fs.writeFileSync(configPath, configStr);
}

main().catch(console.error);
