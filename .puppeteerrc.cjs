const { join } = require('path');

/**
 * Render.com Puppeteer configuration:
 * Tells Puppeteer to cache the downloaded Chromium browser inside the local project directory
 * so it is accessible at runtime across build and start phases.
 */
module.exports = {
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
