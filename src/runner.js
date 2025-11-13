'use strict';

const fs = require('fs');
const path = require('path');
const { createHttpClient, logger, sleep } = require('./extractors/utils_format');
const { parseListing } = require('./extractors/listings_parser');
const { parseFranchise } = require('./extractors/franchise_parser');
const { parseBroker } = require('./extractors/broker_parser');
const { exportData } = require('./outputs/exporters');

const DEFAULT_SETTINGS_PATH = path.join(__dirname, 'config', 'settings.example.json');
const DEFAULT_INPUTS_PATH = path.join(__dirname, '..', 'data', 'inputs.sample.json');

/**
* Load JSON safely from disk.
*/
function loadJson(filePath, description) {
try {
const raw = fs.readFileSync(filePath, 'utf8');
return JSON.parse(raw);
} catch (err) {
logger.error(`Failed to load ${description} from ${filePath}:`, err.message);
throw err;
}
}

/**
* Detect item type (listing, franchise, broker) from URL if not explicitly provided.
*/
function detectTypeFromUrl(url) {
if (!url || typeof url !== 'string') return 'listing';
const lower = url.toLowerCase();

if (lower.includes('/franchise-for-sale') || lower.includes('/franchise/')) {
return 'franchise';
}
if (lower.includes('/business-brokers') || lower.includes('/broker/')) {
return 'broker';
}
return 'listing';
}

/**
* Process a single item (fetch + parse).
*/
async function processItem(client, item, index, settings) {
const url = item.url;
if (!url) {
logger.warn(`Item at index ${index} is missing "url" field, skipping.`);
return null;
}

const type = item.type || detectTypeFromUrl(url);
try {
const html = await client.getWithRetry(url);

if (type === 'franchise') {
const franchise = parseFranchise(html, url);
logger.info(`Parsed franchise item #${index + 1}: ${franchise.header || 'Unnamed franchise'}`);
return franchise;
}

if (type === 'broker') {
const broker = parseBroker(html, url);
logger.info(`Parsed broker item #${index + 1}: ${broker.name || 'Unnamed broker'}`);
return broker;
}

const listing = parseListing(html, url);
logger.info(`Parsed listing item #${index + 1}: ${listing.header || 'Unnamed listing'}`);
return listing;
} catch (err) {
logger.error(`Failed to process item #${index + 1} (${url}):`, err.message);
return null;
} finally {
const delay = settings.delayMs || 0;
if (delay > 0) {
await sleep(delay);
}
}
}

/**
* Run tasks with limited concurrency.
*/
async function runWithConcurrency(items, concurrency, worker) {
const results = new Array(items.length);
let currentIndex = 0;

async function workerLoop(workerId) {
while (true) {
const index = currentIndex;
if (index >= items.length) break;
currentIndex += 1;
logger.debug(`Worker ${workerId} processing index ${index}`);
results[index] = await worker(items[index], index);
}
}

const workers = [];
const workerCount = Math.max(1, Math.min(concurrency || 1, items.length || 1));
for (let i = 0; i < workerCount; i += 1) {
workers.push(workerLoop(i + 1));
}

await Promise.all(workers);
return results.filter((r) => r != null);
}

/**
* Main entry point for CLI usage.
*/
async function main() {
const settingsPath = process.env.BIZBUYSELL_SETTINGS || DEFAULT_SETTINGS_PATH;
const settings = loadJson(settingsPath, 'settings');
logger.setLevel(settings.logLevel || 'info');

const inputsPath = process.argv[2]
? path.resolve(process.cwd(), process.argv[2])
: DEFAULT_INPUTS_PATH;

const items = loadJson(inputsPath, 'inputs');
if (!Array.isArray(items) || items.length === 0) {
logger.warn('No input items found, exiting.');
return;
}

const maxItems = settings.maxItems || items.length;
const limitedItems = items.slice(0, maxItems);
logger.info(`Loaded ${limitedItems.length} input item(s).`);

const httpClient = createHttpClient(settings);

const results = await runWithConcurrency(
limitedItems,
settings.concurrency || 1,
(item, index) => processItem(httpClient, item, index, settings)
);

if (!results.length) {
logger.warn('No results were parsed successfully, nothing to export.');
return;
}

const outputSettings = settings.output || {
dir: path.join(__dirname, '..', 'data'),
fileName: 'output.json',
format: 'json'
};

const exportedPath = exportData(results, outputSettings);
logger.info(`Processing complete. Exported ${results.length} record(s) to ${exportedPath}`);
}

/* Run only when executed directly. */
if (require.main === module) {
main().catch((err) => {
logger.error('Fatal error in runner:', err);
process.exitCode = 1;
});
}

module.exports = {
main
};