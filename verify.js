#!/usr/bin/env node
/**
 * V3.4.2 SYSTEM VERIFICATION
 * Tests everything before live trading
 */

console.log('\n╔════════════════════════════════════════════════╗');
console.log('║   V3.4.2 System Verification                  ║');
console.log('╚════════════════════════════════════════════════╝\n');

let allGood = true;

// 1. Check Node.js version
console.log('📋 Checking Node.js...');
const nodeVersion = process.version.substring(1).split('.')[0];
if (parseInt(nodeVersion) < 16) {
  console.log(`❌ Node.js ${process.version} too old (need v16+)`);
  allGood = false;
} else {
  console.log(`✅ Node.js ${process.version}`);
}

// 2. Check dependencies
console.log('\n📦 Checking dependencies...');
const requiredDeps = ['axios', 'dotenv', 'express', 'ws'];
for (const dep of requiredDeps) {
  try {
    require.resolve(dep);
    console.log(`✅ ${dep}`);
  } catch {
    console.log(`❌ ${dep} - MISSING!`);
    allGood = false;
  }
}

// 3. Check files
console.log('\n📁 Checking files...');
const fs = require('fs');
const path = require('path');

const requiredFiles = [
  'server.js',
  'package.json',
  'public/index.html',
  '.env.example'
];

for (const file of requiredFiles) {
  if (fs.existsSync(path.join(__dirname, file))) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} - MISSING!`);
    allGood = false;
  }
}

// 4. Check .env
console.log('\n🔐 Checking API credentials...');
if (fs.existsSync(path.join(__dirname, '.env'))) {
  require('dotenv').config();
  
  if (process.env.KUCOIN_API_KEY && process.env.KUCOIN_API_KEY !== 'your_api_key_here') {
    console.log('✅ API_KEY configured');
  } else {
    console.log('❌ API_KEY not configured');
    allGood = false;
  }
  
  if (process.env.KUCOIN_API_SECRET && process.env.KUCOIN_API_SECRET !== 'your_api_secret_here') {
    console.log('✅ API_SECRET configured');
  } else {
    console.log('❌ API_SECRET not configured');
    allGood = false;
  }
  
  if (process.env.KUCOIN_API_PASSPHRASE && process.env.KUCOIN_API_PASSPHRASE !== 'your_api_passphrase_here') {
    console.log('✅ API_PASSPHRASE configured');
  } else {
    console.log('❌ API_PASSPHRASE not configured');
    allGood = false;
  }
} else {
  console.log('⚠️  No .env file found');
  console.log('   Create one: cp .env.example .env');
  console.log('   Then add your KuCoin API credentials');
  allGood = false;
}

// 5. Check package.json version
console.log('\n📌 System version...');
const pkg = require('./package.json');
console.log(`✅ v${pkg.version} - ${pkg.description}`);

// Final result
console.log('\n' + '═'.repeat(52) + '\n');

if (allGood) {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║      ✅ SYSTEM READY FOR TRADING!             ║');
  console.log('╚════════════════════════════════════════════════╝\n');
  console.log('🚀 Start trading: npm start\n');
  console.log('📊 Dashboard: http://localhost:3001\n');
  process.exit(0);
} else {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║      ❌ ISSUES FOUND - FIX BEFORE TRADING     ║');
  console.log('╚════════════════════════════════════════════════╝\n');
  console.log('🔧 Fix the issues above, then run again:\n');
  console.log('   node verify.js\n');
  process.exit(1);
}
