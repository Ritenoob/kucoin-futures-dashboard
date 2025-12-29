const express = require('express');
const winston = require('winston');
const axios = require('axios');

// Setup winston for structured logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

// Function for retry with backoff
function retryWithBackoff(fn, retries = 3, delay = 1000) {
  return new Promise((resolve, reject) => {
    const attempt = (retriesLeft) => {
      fn()
        .then(resolve)
        .catch((error) => {
          if (retriesLeft > 0) {
            logger.warn(`API call failed, retrying in ${delay}ms`, { error: error.message });
            setTimeout(() => attempt(retriesLeft - 1), delay);
            delay *= 2;
          } else {
            reject(error);
          }
        });
    };
    attempt(retries);
  });
}

const app = express();
app.use(express.json());

// Healthcheck endpoint
app.get('/health', (req, res) => {
  logger.info('Health check requested');
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Example API call with retry (assuming Kucoin API calls are present)
app.get('/api/data', async (req, res) => {
  try {
    const data = await retryWithBackoff(() => axios.get('https://api.kucoin.com/api/v1/ticker?symbol=BTC-USDT'));
    logger.info('Fetched data from Kucoin API');
    res.json(data.data);
  } catch (error) {
    logger.error('Failed to fetch data after retries', { error: error.message });
    res.status(500).send('Error fetching data');
  }
});

app.listen(3000, () => {
  logger.info('Server started on port 3000');
});