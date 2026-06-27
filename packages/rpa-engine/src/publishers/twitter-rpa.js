/**
 * Twitter/X RPA Publisher
 *
 * Uses Playwright to automate twitter.com
 * Flow: Login check -> Tweet composer -> Post text/images -> Publish
 *
 * Selectors target Twitter's current DOM structure (as of 2025-2026).
 * Twitter frequently updates its UI; if selectors fail, inspect the page
 * and update the selectors below.
 */
const BaseRPAPublisher = require('./base-rpa-publisher');
const { smartWait } = require('../playwright-manager');

const TWITTER_URL = 'https://twitter.com/';
const TWITTER_LOGIN_URL = 'https://twitter.com/i/flow/login';
const TWITTER_COMPOSE_URL = 'https://twitter.com/compose/tweet';
const LOGIN_TIMEOUT = 120000;
const MAX_CHARS_FREE = 280;
const MAX_CHARS_PREMIUM = 4000;

class TwitterPublisher extends BaseRPAPublisher {
  constructor() {
    super('twitter');
  }

  async checkLogin() {
    await this.page.goto(TWITTER_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await smartWait(this.page, null, 2000);

    // Check for logged-in indicators: primary timeline or account switcher button
    const loggedIn = await this.page.$$eval('div[data-testid="primaryColumn"], div[data-testid="SideNav_AccountSwitcher_Button"], header[role="banner"]', els => els.length > 0);
    if (loggedIn) return true;

    // If redirected to login page, not logged in
    const currentUrl = this.page.url();
    return !(currentUrl.includes('login') || currentUrl.includes('i/flow'));
  }

  async waitForLogin(timeout) {
    timeout = timeout || LOGIN_TIMEOUT;
    try {
      await this.page.waitForSelector('div[data-testid="primaryColumn"], div[data-testid="SideNav_AccountSwitcher_Button"]', { timeout });
      return true;
    } catch (e) {
      return false;
    }
  }

  async publish(article) {
    this._progress('Opening Twitter composer...');
    await this.page.goto(TWITTER_COMPOSE_URL, { waitUntil: 'networkidle' });
    await smartWait(this.page, null, 3000);

    // If compose page redirects to home, click the Post button manually
    const isOnCompose = await this.page.$('div[data-testid="tweetTextarea_0"], div[aria-label*="Post"][role="textbox"]');
    if (!isOnCompose) {
      this._progress('Opening tweet composer from home...');
      const postBtn = await this.page.$('a[data-testid="SideNav_NewTweet_Button"], a[aria-label="Post"]');
      if (postBtn) {
        await postBtn.click();
        await smartWait(this.page, null, 2000);
      }
    }

    this._progress('Filling tweet content...');
    await this._fillContent(article);

    // Upload images if provided
    if (article.images && article.images.length > 0) {
      this._progress('Attaching images...');
      await this._uploadImages(article.images);
    }

    this._progress('Posting...');
    const result = await this._doPublish();
    return result;
  }

  async _fillContent(article) {
    // Find the tweet text area
    const textarea = await this.page.$(
      'div[data-testid="tweetTextarea_0"][role="textbox"], ' +
      'div[aria-label*="Post"][role="textbox"], ' +
      'div[aria-label*="Tweet"][role="textbox"], ' +
      'div[class*="public-DraftEditor-content"]'
    );
    if (!textarea) {
      throw new Error('Could not locate tweet composer textarea');
    }

    await textarea.click();
    await smartWait(this.page, null, 300);

    // Build tweet text: title + content
    const plainText = (article.content || '').replace(/<[^>]+>/g, '').trim();
    const fullText = article.title
      ? article.title + '\n\n' + plainText
      : plainText;

    // Twitter character limit: 280 for free, 4000 for Premium
    const maxLen = article.twitter_premium ? MAX_CHARS_PREMIUM : MAX_CHARS_FREE;
    const truncated = fullText.length > maxLen ? fullText.slice(0, maxLen) : fullText;

    // Fill the textarea
    await textarea.fill(truncated);
    await smartWait(this.page, null, 500);

    // Verify text was entered (Twitter sometimes rejects fill())
    const enteredText = await this.page.evaluate(function() {
      var el = document.querySelector('div[data-testid="tweetTextarea_0"][role="textbox"], div[aria-label*="Post"][role="textbox"]');
      if (!el) return '';
      return el.textContent || el.innerText || '';
    });

    if (!enteredText && truncated.length > 0) {
      // Fallback: type via keyboard
      await textarea.type(truncated, { delay: 30 });
      await smartWait(this.page, null, 500);
    }
  }

  async _uploadImages(images) {
    // Try clicking the media button first
    var mediaBtn = await this.page.$('div[data-testid="mediaButton"], input[data-testid="fileInput"], div[aria-label="Media"][role="button"]');
    if (!mediaBtn) {
      this._progress('Media button not found, trying to find file input directly...');
    }

    // Try to find and use the file input directly
    var fileInput = await this.page.$('input[data-testid="fileInput"], input[type="file"][accept*="image"]');
    if (fileInput) {
      var imgPaths = Array.isArray(images) ? images : [images];
      var validPaths = imgPaths.filter(function(p) { return typeof p === 'string' && p.length > 0; });
      if (validPaths.length > 0) {
        await fileInput.setInputFiles(validPaths.slice(0, 4)); // Twitter max 4 images
        this._progress('Images attached, waiting for upload...');
        await smartWait(this.page, null, 3000);
      }
    } else {
      this._progress('Could not find file input for image upload, continuing without images');
    }
  }

  async _doPublish() {
    // Wait for the Post/Tweet button to be enabled
    await smartWait(this.page, null, 1000);

    var postBtn = await this.page.$(
      'div[data-testid="tweetButton"][role="button"], ' +
      'button:has-text("Post"), ' +
      'div[role="button"]:has-text("Post"):not([aria-disabled="true"]), ' +
      'div[data-testid="tweetButton"]:not([aria-disabled="true"])'
    );

    if (postBtn) {
      await postBtn.click();
      await smartWait(this.page, null, 4000);

      // Wait for the post to complete (the composer should close)
      try {
        await this.page.waitForFunction(function() {
          return document.querySelector('div[data-testid="tweetButton"]') === null ||
                 document.querySelector('div[role="dialog"]') === null;
        }, { timeout: 10000, polling: 500 });
      } catch (e) {
        // Timeout waiting for dialog close is acceptable
      }

      return { success: true, url: this.page.url(), platform: 'twitter' };
    }

    // Try the Reply button which doubles as post in some contexts
    var replyBtn = await this.page.$('div[data-testid="tweetButton"], button:has-text("Reply")');
    if (replyBtn) {
      await replyBtn.click();
      await smartWait(this.page, null, 3000);
      return { success: true, url: this.page.url(), platform: 'twitter' };
    }

    return { success: false, error: 'Could not find Twitter Post button', url: this.page.url(), platform: 'twitter' };
  }
}

module.exports = TwitterPublisher;
