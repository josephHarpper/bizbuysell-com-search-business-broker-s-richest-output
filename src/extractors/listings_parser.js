'use strict';

const cheerio = require('cheerio');
const { cleanText, parseMoney, toNumber, logger } = require('./utils_format');

/**
 * Extract key/value rows from a definition table.
 */
function parseDetailsTable($, rootSelector) {
  const details = {};
  const $root = rootSelector ? $(rootSelector) : $('table');
  $root.each((_, table) => {
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
 * Extract breadcrumb / classification metadata.
 */
function parseDiamondMetaData($) {
  const breadcrumbs = [];
  $('.breadcrumb li, nav[aria-label="breadcrumb"] li').each((_, li) => {
    const text = cleanText($(li).text());
    if (text && !breadcrumbs.includes(text)) breadcrumbs.push(text);
  });

  const categories = [];
  $('[data-qa="listing-category"], .listing-category, .tag-list .tag').each((_, el) => {
    const text = cleanText($(el).text());
    if (text && !categories.includes(text)) categories.push(text);
  });

  const regions = [];
  $('[data-qa="listing-region"], .listing-region').each((_, el) => {
    const text = cleanText($(el).text());
    if (text && !regions.includes(text)) regions.push(text);
  });

  return {
    breadcrumbs,
    categories,
    regions
  };
}

/**
 * Extract contact info from listing page.
 */
function parseContactInfo($) {
  const contact = {};

  const name =
    cleanText(
      $('[itemprop="name"].broker-name, .broker-name, .contact-name, [data-qa="contact-name"]').first().text()
    ) || null;
  if (name) contact.contactFullName = name;

  const phone =
    cleanText(
      $('a[href^="tel"], .phone, [data-qa="contact-phone"]').first().text()
    ) || null;
  if (phone) {
    contact.contactPhoneNumber = { telephone: phone.replace(/[^\d+]/g, '') || phone };
  }

  const profileUrl =
    $('a[href*="/business-brokers/"], a[href*="/broker/"]').first().attr('href') || null;
  if (profileUrl) {
    contact.profileUrl = profileUrl.startsWith('http')
      ? profileUrl
      : `https://www.bizbuysell.com${profileUrl}`;
  }

  const company =
    cleanText(
      $('.broker-company, [data-qa="broker-company"], .contact-company').first().text()
    ) || null;
  if (company) contact.company = company;

  const email =
    $('a[href^="mailto:"]').first().attr('href') || null;
  if (email) {
    contact.email = email.replace(/^mailto:/, '');
  }

  return contact;
}

/**
 * Extract broker summary from listing page.
 */
function parseBrokerFromListing($, contactInfo) {
  const broker = {
    name: null,
    company: null,
    title: null,
    email: null,
    phone: null,
    location: null
  };

  if (contactInfo && contactInfo.contactFullName) broker.name = contactInfo.contactFullName;
  if (contactInfo && contactInfo.company) broker.company = contactInfo.company;
  if (contactInfo && contactInfo.email) broker.email = contactInfo.email;
  if (contactInfo && contactInfo.contactPhoneNumber && contactInfo.contactPhoneNumber.telephone) {
    broker.phone = contactInfo.contactPhoneNumber.telephone;
  }

  const title =
    cleanText(
      $('.broker-title, [data-qa="broker-title"]').first().text()
    ) || null;
  if (title) broker.title = title;

  const location =
    cleanText(
      $('.broker-location, [data-qa="broker-location"]').first().text()
    ) || null;
  if (location) broker.location = location;

  return broker;
}

/**
 * Extract key numeric financials from details object.
 */
function deriveFinancials(details) {
  const cashFlow =
    parseMoney(details['Cash Flow']) ||
    parseMoney(details['Cash Flow (SDE)']) ||
    parseMoney(details['Cash Flow (SDE):']) ||
    null;

  const ebitda =
    parseMoney(details['EBITDA']) ||
    parseMoney(details['EBITDA:']) ||
    null;

  const price =
    parseMoney(details['Asking Price']) ||
    parseMoney(details['Price']) ||
    null;

  return { cashFlow, ebitda, price };
}

/**
 * Extract a listing record from HTML.
 */
function parseListing(html, url) {
  const $ = cheerio.load(html);

  const header =
    cleanText(
      $('h1[data-qa="listing-title"], h1[itemprop="name"], h1').first().text()
    ) || null;

  let location =
    cleanText(
      $('[data-qa="listing-location"], .listing-location, .location').first().text()
    ) || null;

  if (!location) {
    const locRow = $('tr:contains("Location") td').last().text();
    location = cleanText(locRow) || null;
  }

  // Gather image URLs from common containers.
  const imgSet = new Set();
  $('.carousel img, .gallery img, img').each((_, img) => {
    const src = $(img).attr('src') || $(img).attr('data-src');
    if (!src) return;
    const absolute = src.startsWith('http')
      ? src
      : `https://images.bizbuysell.com/${src.replace(/^\/+/, '')}`;
    imgSet.add(absolute);
  });

  const description =
    cleanText(
      $('#listing-description, .listing-description, [data-qa="listing-description"], article').first().text()
    ) || null;

  const details = parseDetailsTable($);
  const { cashFlow, ebitda, price } = deriveFinancials(details);

  let explicitPrice =
    cleanText(
      $('[data-qa="listing-price"], .listing-price, .price').first().text()
    ) || null;
  const numericPrice = price || parseMoney(explicitPrice);

  const cashFlowFallback =
    cashFlow ||
    toNumber(
      cleanText(
        $('[data-qa="listing-cashflow"], .listing-cashflow').first().text()
      )
    ) ||
    null;

  const contactInfo = parseContactInfo($);
  const broker = parseBrokerFromListing($, contactInfo);
  const diamondMetaData = parseDiamondMetaData($);

  const listing = {
    header,
    location,
    price: numericPrice,
    description,
    cashFlow: cashFlowFallback,
    ebitda,
    img: Array.from(imgSet),
    urlStub: url,
    contactInfo,
    details,
    diamondMetaData,
    broker,
    listings: [],
    soldListings: [],
    services: [],
    expertise: []
  };

  logger.debug('Parsed listing object:', listing);
  return listing;
}

module.exports = {
  parseListing
};