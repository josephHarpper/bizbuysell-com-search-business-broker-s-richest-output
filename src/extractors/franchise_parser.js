'use strict';

const cheerio = require('cheerio');
const { cleanText, parseMoney, toNumber, logger } = require('./utils_format');

/**
 * Parse key/value details about a franchise.
 */
function parseFranchiseDetails($) {
  const details = {};
  $('table, .franchise-details, .key-details').each((_, table) => {
    $(table)
      .find('tr')
      .each((__, tr) => {
        const $cells = $(tr).find('th,td');
        if ($cells.length < 2) return;
        const key = cleanText($cells.eq(0).text());
        const value = cleanText($cells.eq($cells.length - 1).text());
        if (key && value && !details[key]) {
          details[key] = value;
        }
      });
  });
  return details;
}

/**
 * Parse investment / fee range text into a min/max object.
 */
function parseRange(value) {
  if (!value) return { min: null, max: null };
  const parts = value
    .replace(/[^\d.,\-+]/g, ' ')
    .split(/[-–to]+/i)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) return { min: null, max: null };
  if (parts.length === 1) {
    const num = parseMoney(parts[0]);
    return { min: num, max: num };
  }

  return {
    min: parseMoney(parts[0]),
    max: parseMoney(parts[1])
  };
}

/**
 * Extract core franchise fields from HTML.
 */
function parseFranchise(html, url) {
  const $ = cheerio.load(html);

  const header =
    cleanText(
      $('h1[data-qa="franchise-title"], h1[itemprop="name"], h1').first().text()
    ) || null;

  const summary =
    cleanText(
      $('[data-qa="franchise-summary"], .franchise-summary, .listing-description, article').first().text()
    ) || null;

  const details = parseFranchiseDetails($);

  const franchiseFees = {
    initialFranchiseFee: parseMoney(details['Franchise Fee'] || details['Initial Franchise Fee']),
    royaltyFee: details['Royalty'] || details['Royalty Fee'] || null,
    adFund: details['Ad Fund'] || details['Advertising Fee'] || null
  };

  const totalInvestmentRange = parseRange(
    details['Total Investment'] ||
      details['Initial Investment'] ||
      details['Investment Range']
  );

  const cashRequired = parseMoney(
    details['Cash Required'] || details['Liquid Capital Required']
  );

  const units = {
    totalUnits: toNumber(details['Units'] || details['Units in Operation']),
    companyOwned: toNumber(details['Company Owned'] || details['Company Units']),
    franchised: toNumber(details['Franchised'] || details['Franchise Units'])
  };

  const company = {
    founded: cleanText(details['Founded'] || details['Year Founded'] || '') || null,
    franchisingSince:
      cleanText(
        details['Franchising Since'] ||
          details['Franchising Since:'] ||
          ''
      ) || null,
    headquarters:
      cleanText(
        details['Headquarters'] || details['Headquarters Location'] || ''
      ) || null
  };

  const imgSet = new Set();
  $('.carousel img, .gallery img, img').each((_, img) => {
    const src = $(img).attr('src') || $(img).attr('data-src');
    if (!src) return;
    const absolute = src.startsWith('http')
      ? src
      : `https://images.bizbuysell.com/${src.replace(/^\/+/, '')}`;
    imgSet.add(absolute);
  });

  const franchise = {
    type: 'franchise',
    header,
    description: summary,
    urlStub: url,
    img: Array.from(imgSet),
    franchiseFees,
    totalInvestment: totalInvestmentRange,
    cashRequired,
    units,
    company,
    details
  };

  logger.debug('Parsed franchise object:', franchise);
  return franchise;
}

module.exports = {
  parseFranchise
};