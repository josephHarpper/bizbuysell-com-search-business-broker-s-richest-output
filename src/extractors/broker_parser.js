'use strict';

const cheerio = require('cheerio');
const { cleanText, parseMoney, logger } = require('./utils_format');

/**
 * Parse a listing card element into a simplified object.
 */
function parseListingCard($, card, isSold = false) {
  const $card = $(card);
  const header =
    cleanText(
      $card.find('[data-qa="listing-title"], .listing-title, h3, h2').first().text()
    ) || null;

  const location =
    cleanText(
      $card.find('[data-qa="listing-location"], .listing-location').first().text()
    ) || null;

  const priceText =
    cleanText(
      $card.find('[data-qa="listing-price"], .listing-price, .price').first().text()
    ) || null;

  const price = parseMoney(priceText);

  const url =
    $card.find('a[href*="/business-opportunity/"], a[href*="/business-for-sale/"]').first().attr('href') ||
    $card.find('a').first().attr('href') ||
    null;

  const urlStub =
    url && url.startsWith('http') ? url : url ? `https://www.bizbuysell.com${url}` : null;

  const status = isSold ? 'sold' : 'active';

  return {
    header,
    location,
    price,
    status,
    urlStub
  };
}

/**
 * Extract listings and sold listings from a broker page.
 */
function parseBrokerListings($) {
  const listings = [];
  const soldListings = [];

  $('[data-qa="broker-active-listings"], .broker-active-listings, .active-listings')
    .find('.listing-card, .result-row, article')
    .each((_, el) => {
      listings.push(parseListingCard($, el, false));
    });

  $('[data-qa="broker-sold-listings"], .broker-sold-listings, .sold-listings')
    .find('.listing-card, .result-row, article')
    .each((_, el) => {
      soldListings.push(parseListingCard($, el, true));
    });

  return { listings, soldListings };
}

/**
 * Extract broker profile info.
 */
function parseBrokerProfile($, url) {
  const name =
    cleanText(
      $('h1[data-qa="broker-name"], h1[itemprop="name"], h1').first().text()
    ) || null;

  const title =
    cleanText(
      $('[data-qa="broker-title"], .broker-title').first().text()
    ) || null;

  const company =
    cleanText(
      $('[data-qa="broker-company"], .broker-company').first().text()
    ) || null;

  const location =
    cleanText(
      $('[data-qa="broker-location"], .broker-location, .location').first().text()
    ) || null;

  const phone =
    cleanText(
      $('a[href^="tel"], .broker-phone, [data-qa="broker-phone"]').first().text()
    ) || null;

  const emailHref = $('a[href^="mailto:"]').first().attr('href') || null;
  const email = emailHref ? emailHref.replace(/^mailto:/, '') : null;

  const biography =
    cleanText(
      $('[data-qa="broker-bio"], .broker-bio, .bio').first().text()
    ) || null;

  const services = [];
  $('[data-qa="broker-services"] li, .broker-services li, .services li').each((_, li) => {
    const text = cleanText($(li).text());
    if (text) services.push(text);
  });

  const expertise = [];
  $('[data-qa="broker-expertise"] li, .broker-expertise li, .expertise li').each((_, li) => {
    const text = cleanText($(li).text());
    if (text) expertise.push(text);
  });

  const { listings, soldListings } = parseBrokerListings($);

  const broker = {
    type: 'broker',
    name,
    title,
    company,
    location,
    phone,
    email,
    biography,
    urlStub: url,
    services,
    expertise,
    listings,
    soldListings
  };

  logger.debug('Parsed broker object:', broker);
  return broker;
}

/**
 * Public entry point.
 */
function parseBroker(html, url) {
  const $ = cheerio.load(html);
  return parseBrokerProfile($, url);
}

module.exports = {
  parseBroker
};