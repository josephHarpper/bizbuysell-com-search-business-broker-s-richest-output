'use strict';

const axios = require('axios');

/**
* Basic leveled logger.
*/
const logger = {
levels: ['error', 'warn', 'info', 'debug'],
currentLevel: 'info',

setLevel(level) {
if (this.levels.includes(level)) {
this.currentLevel = level;
}
},

shouldLog(level) {
return this.levels.indexOf(level) <= this.levels.indexOf(this.currentLevel);
},

error(...args) {
if (this.shouldLog('error')) console.error('[ERROR]', ...args);
},

warn(...args) {
if (this.shouldLog('warn')) console.warn('[WARN]', ...args);
},

info(...args) {
if (this.shouldLog('info')) console.info('[INFO]', ...args);
},

debug(...args) {
if (this.shouldLog('debug')) console.debug('[DEBUG]', ...args);
}
};

/**
* Normalize whitespace in a string.
*/
function cleanText(value) {
if (typeof value !== 'string') return '';
return value.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
}

/**
* Extract the first numeric value from a string as float.
*/
function toNumber(value) {
if (typeof value === 'number') return value;
if (!value || typeof value !== 'string') return null;
const cleaned = value.replace(/[^0-9.+-]/g, ' ');
const match = cleaned.match(/[+-]?\d+(\.\d+)?/);
if (!match) return null;
const num = parseFloat(match[0]);
return Number.isNaN(num) ? null : num;
}

/**
* Parse a money-like string to a number.
*/
function parseMoney(value) {
if (!value) return null;
return toNumber(value);
}

/**
* Safe getter for nested paths.
*/
function safeGet(obj, path, defaultValue = null) {
try {
const segments = path.split('.');
let cur = obj;
for (const segment of segments) {
if (cur == null) return defaultValue;
cur = cur[segment];
}
return cur == null ? defaultValue : cur;
} catch (err) {
return defaultValue;
}
}

/**
* Sleep for given milliseconds.
*/
function sleep(ms) {
return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
* Create an axios instance with optional proxy and retry behavior.
*/
function createHttpClient(settings) {
const httpSettings = settings && settings.http ? settings.http : {};
const {
timeoutMs = 20000,
retries = 3,
userAgent = 'Mozilla/5.0 (compatible; BizBuySellRichScraper/1.0)',
proxy = {}
} = httpSettings;

const axiosConfig = {
timeout: timeoutMs,
headers: {
'User-Agent': userAgent,
Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
},
maxRedirects: 5
};

if (proxy && proxy.enabled && proxy.host && proxy.port) {
axiosConfig.proxy = {
protocol: proxy.protocol || 'http',
host: proxy.host,
port: proxy.port,
auth:
proxy.auth && proxy.auth.username
? {
username: proxy.auth.username,
password: proxy.auth.password || ''
}
: undefined
};
}

const client = axios.create(axiosConfig);

/**
* Fetch URL with simple retry strategy.
*/
async function getWithRetry(url) {
let attempt = 0;
let lastError;
while (attempt < retries) {
attempt += 1;
try {
logger.info(`Fetching [attempt ${attempt}/${retries}]: ${url}`);
const res = await client.get(url);
return res.data;
} catch (err) {
lastError = err;
logger.warn(`Request failed (attempt ${attempt}/${retries}) for ${url}:`, err.message);
if (attempt < retries) {
const backoff = 500 * attempt;
logger.info(`Retrying in ${backoff}ms...`);
await sleep(backoff);
}
}
}
logger.error(`All retries exhausted for ${url}`, lastError && lastError.message);
throw lastError || new Error(`Failed to fetch ${url}`);
}

return { client, getWithRetry };
}

module.exports = {
logger,
cleanText,
toNumber,
parseMoney,
safeGet,
sleep,
createHttpClient
};