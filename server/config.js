const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const envPath = path.join(projectRoot, '.env');

if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

function getEnv(name, { required = false, defaultValue = '', devFallback = undefined } = {}) {
  const value = process.env[name];
  if (typeof value === 'string' && value.trim() !== '') {
    return value.trim();
  }

  if (required && process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  if (devFallback !== undefined) {
    return devFallback;
  }

  return defaultValue;
}

const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  getEnv,
  isProduction,
  env: process.env
};
