'use strict';

const fs = require('fs');
const path = require('path');
const { logger } = require('../extractors/utils_format');

/**
 * Ensure directory exists.
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Export data as pretty-printed JSON.
 */
function exportToJson(data, options) {
  const dir = options.dir || 'data';
  const fileName = options.fileName || 'output.json';
  ensureDir(dir);

  const fullPath = path.resolve(dir, fileName);
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');
  logger.info(`JSON output written to ${fullPath}`);
  return fullPath;
}

/**
 * Flatten an object to a one-level map with dot-separated keys.
 */
function flattenObject(obj, prefix = '', out = {}) {
  Object.keys(obj || {}).forEach((key) => {
    const value = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flattenObject(value, newKey, out);
    } else {
      out[newKey] = value;
    }
  });
  return out;
}

/**
 * Export data as CSV.
 * Nested objects are flattened; arrays are stringified as JSON.
 */
function exportToCsv(data, options) {
  const dir = options.dir || 'data';
  const fileName = options.fileName || 'output.csv';
  ensureDir(dir);

  const fullPath = path.resolve(dir, fileName);
  if (!Array.isArray(data) || data.length === 0) {
    fs.writeFileSync(fullPath, '', 'utf8');
    logger.warn('No data to write to CSV, creating empty file.');
    return fullPath;
  }

  const flattenedRows = data.map((row) => {
    const flat = flattenObject(row);
    Object.keys(flat).forEach((key) => {
      const value = flat[key];
      if (Array.isArray(value) || (value && typeof value === 'object')) {
        flat[key] = JSON.stringify(value);
      }
    });
    return flat;
  });

  const headerSet = new Set();
  flattenedRows.forEach((row) => {
    Object.keys(row).forEach((key) => headerSet.add(key));
  });
  const headers = Array.from(headerSet);

  const escapeCsv = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [];
  lines.push(headers.map(escapeCsv).join(','));
  flattenedRows.forEach((row) => {
    const line = headers.map((h) => escapeCsv(row[h]));
    lines.push(line.join(','));
  });

  fs.writeFileSync(fullPath, lines.join('\n'), 'utf8');
  logger.info(`CSV output written to ${fullPath}`);
  return fullPath;
}

/**
 * Export based on settings.
 */
function exportData(data, outputSettings) {
  const { dir = 'data', fileName = 'output.json', format = 'json' } = outputSettings || {};
  const normalizedFormat = String(format || 'json').toLowerCase();

  if (normalizedFormat === 'csv') {
    return exportToCsv(data, { dir, fileName: fileName.endsWith('.csv') ? fileName : `${fileName}.csv` });
  }

  return exportToJson(data, { dir, fileName: fileName.endsWith('.json') ? fileName : `${fileName}.json` });
}

module.exports = {
  exportToJson,
  exportToCsv,
  exportData
};