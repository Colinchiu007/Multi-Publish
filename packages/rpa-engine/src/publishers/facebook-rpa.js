/**
 * Facebook RPA Publisher
 *
 * Uses Playwright to automate facebook.com
 * Flow: Login check -> Create post -> Write content -> Upload media -> Publish
 *
 * Facebook has complex DOM structure; uses text content and aria-label selectors.
 * Handles: text with image, text with video, link sharing.
 */

const BaseRPAPublisher = require('./base-rpa-publisher');
const { smartWait } = require('../playwright-manager');

const FACEBOOK_URL = 'https://www.facebook.com/';
const LOGIN_TIMEOUT = 120000;

class FacebookPublisher extends BaseRPAPublisher {
  constructor() {
    super('facebook');
  }

  async checkLogin() {
    await this.page.goto(FACEBOOK_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await smartWait(this.page, null, 2000);

    const loggedIn = await this.page.$$eval(
      'a[aria-label*="profile"], a[aria-label*="Profile"], ' +
      'div[aria-label*="Account"], div[data-pagelet*="root"], ' +
      'div[role="navigation"] a[href*="home"]',
      els => els.length > 0
    );
    if (loggedIn) return true;

    const currentUrl = this.page.url();
    return !(currentUrl.includes('login') || currentUrl.includes('checkpoint'));
  }

  async waitForLogin(timeout) {
    timeout = timeout || LOGIN_TIMEOUT;
    try {
      await this.page.waitForSelector(
        'a[aria-label*="profile"], a[aria-label*="Profile"], ' +
        'div[aria-label*="Account"], div[data-pagelet*="root"]',
        { timeout }
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  async publish(article) {
    const checkpoint = await this.page.$('div[aria-label*="checkpoint"], form[action*="checkpoint"]');
    if (checkpoint) {
      throw new Error(
        'Facebook requires additional authentication. ' +
        'Please log in manually in the browser window and complete any security challenges, ' +
        'then retry the publish. Cookie session will be saved for future use.'
      );
    }

    this._progress('Navigating to Facebook...');
    await this.page.goto(FACEBOOK_URL, { waitUntil: 'networkidle' });
    await smartWait(this.page, null, 3000);

    this._progress('Opening post composer...');
    await this._openComposer(article);

    this._progress('Writing content...');
    await this._writeContent(article);

    if (article.images && article.images.length > 0) {
      this._progress('Attaching images...');
      await this._uploadMedia(article.images, 'image');
    } else if (article.video_path) {
      this._progress('Attaching video...');
      await this._uploadMedia(article.video_path, 'video');
    }

    if (article.link_url) {
      this._progress('Adding link...');
      await this._addLink(article);
    }

    this._progress('Publishing...');
    const result = await this._doPublish();
    return result;
  }

  async _openComposer(article) {
    var composerTrigger = await this.page.$(
      'div[role="button"]:has-text("What\'s on your mind"), ' +
      'span:has-text("What\'s on your mind"), ' +
      'div[role="button"]:has-text("想分享什么"), ' +
      'div[aria-label*="Create a post"][role="button"], ' +
      'div[aria-label*="post"][role="button"] ' +
      'form[method="POST"] div[contenteditable="true"]'
    );
    if (composerTrigger) {
      await composerTrigger.click();
      await smartWait(this.page, null, 3000);
    }
  }

  async _writeContent(article) {
    var plainText = (article.content || '').replace(/<[^>]+>/g, '').trim();
    var fullText = article.title
      ? article.title + '\n\n' + plainText
      : plainText;

    await smartWait(this.page, null, 1000);

    var editor = await this.page.$(
      'div[role="dialog"] div[contenteditable="true"], ' +
      'div[aria-label*="What\'s on your mind"][role="textbox"], ' +
      'div[aria-label*="Create a post"][contenteditable="true"], ' +
      'div[aria-label*="Write"][contenteditable="true"], ' +
      'form[method="POST"] div[contenteditable="true"]'
    );

    if (!editor) {
      throw new Error('Could not locate Facebook post composer editor');
    }

    await editor.click();
    await smartWait(this.page, null, 300);
    await editor.fill(fullText);
    await smartWait(this.page, null, 500);
  }

  async _uploadMedia(media, mediaType) {
    var fileInput = await this.page.$(
      'input[type="file"][accept*="image"], input[type="file"][accept*="video"], ' +
      'input[type="file"]'
    );

    if (!fileInput) {
      var mediaBtn = await this.page.$(
        'div[aria-label*="Photo"][role="button"], ' +
        'div[aria-label*="photo"][role="button"], ' +
        'div[aria-label*="Video"][role="button"], ' +
        'div[aria-label*="video"][role="button"], ' +
        'i[class*="photos"], i[class*="camera"], ' +
        'div[data-nocookies="true"]'
      );
      if (mediaBtn) {
        await mediaBtn.click();
        await smartWait(this.page, null, 2000);
        fileInput = await this.page.$('input[type="file"]');
      }
    }

    if (!fileInput) {
      this._progress('Could not find file input for media, continuing without media');
      return;
    }

    if (mediaType === 'image' && Array.isArray(media)) {
      var validPaths = media.filter(function(p) { return typeof p === 'string' && p.length > 0; });
      if (validPaths.length > 0) {
        await fileInput.setInputFiles(validPaths.slice(0, 10));
        this._progress('Images attached, waiting for upload...');
        await smartWait(this.page, null, 3000);
      }
    } else if (mediaType === 'video' && typeof media === 'string') {
      await fileInput.setInputFiles([media]);
      this._progress('Video attached, waiting for upload...');
      await smartWait(this.page, null, 5000);
    }
  }

  async _addLink(article) {
    var linkBtn = await this.page.$(
      'div[aria-label*="Link"][role="button"], span:has-text("Link"), ' +
      'div[role="button"]:has-text("Add link")'
    );
    if (linkBtn) {
      await linkBtn.click();
      await smartWait(this.page, null, 1000);
    }

    var linkInput = await this.page.$(
      'input[type="text"][placeholder*="link"], input[placeholder*="Link"], input[placeholder*="URL"]'
    );
    if (linkInput) {
      await linkInput.fill(article.link_url);
      await smartWait(this.page, null, 1000);
    }
  }

  async _doPublish() {
    await smartWait(this.page, null, 1500);

    var publishBtn = await this.page.$(
      'div[role="dialog"] div[role="button"]:has-text("Post"), ' +
      'div[role="dialog"] button:has-text("Post"), ' +
      'div[role="dialog"] div[role="button"]:has-text("Post"), ' +
      'div[aria-label*="Post"][role="button"]:not([aria-disabled="true"]), ' +
      'button:has-text("Post"):not([disabled])'
    );

    if (publishBtn) {
      await publishBtn.click();
      await smartWait(this.page, null, 5000);
      return { success: true, url: this.page.url(), platform: 'facebook' };
    }

    return { success: false, error: 'Could not find Facebook Post button', url: this.page.url(), platform: 'facebook' };
  }
}

module.exports = FacebookPublisher;
