/**
 * Instagram RPA Publisher
 *
 * Uses Playwright to automate instagram.com
 * Flow: Login check -> Create post -> Upload media -> Write caption -> Publish
 *
 * Instagram uses stable aria-label attributes for selectors.
 * For 2FA: throws a clear error requiring manual authentication.
 */

const BaseRPAPublisher = require('./base-rpa-publisher');
const { smartWait } = require('../playwright-manager');

const INSTAGRAM_URL = 'https://www.instagram.com/';
const LOGIN_TIMEOUT = 120000;
const MAX_CAPTION_LENGTH = 2200;
const MAX_IMAGES = 10;

class InstagramPublisher extends BaseRPAPublisher {
  constructor() {
    super('instagram');
  }

  async checkLogin() {
    await this.page.goto(INSTAGRAM_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await smartWait(this.page, null, 2000);

    // Check for logged-in indicators: home icon, nav, feed articles
    const loggedIn = await this.page.$$eval(
      'svg[aria-label="Home"], nav[role="navigation"], section main article, a[href="/direct/inbox/"]',
      els => els.length > 0
    );
    if (loggedIn) return true;

    // If we see the login form, we are not logged in
    const currentUrl = this.page.url();
    return !(currentUrl.includes('login') || currentUrl.includes('accounts'));
  }

  async waitForLogin(timeout) {
    timeout = timeout || LOGIN_TIMEOUT;
    try {
      await this.page.waitForSelector(
        'svg[aria-label="Home"], nav[role="navigation"], section main article, a[href="/direct/inbox/"]',
        { timeout }
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  async publish(article) {
    // Check if 2FA is required first
    const is2fa = await this.page.$('input[name="verificationCode"], input[aria-label*="code"], input[aria-label*="Code"]');
    if (is2fa) {
      throw new Error(
        'Instagram requires two-factor authentication. ' +
        'Please log in manually in the browser window, complete the 2FA challenge, ' +
        'then retry the publish. Cookie session will be saved for future use.'
      );
    }

    this._progress('Navigating to Instagram home...');
    await this.page.goto(INSTAGRAM_URL, { waitUntil: 'networkidle' });
    await smartWait(this.page, null, 2000);

    // Click the Create button (plus icon in navigation)
    this._progress('Opening create post dialog...');
    await this._openCreateDialog();

    // Upload media files (images or video)
    if (article.images && article.images.length > 0) {
      this._progress('Uploading media...');
      await this._uploadMedia(article.images, article.video_path);
    } else if (article.video_path) {
      this._progress('Uploading video...');
      await this._uploadMedia([], article.video_path);
    }

    // Write caption / description
    this._progress('Writing caption...');
    await this._writeCaption(article);

    // Publish
    this._progress('Publishing...');
    const result = await this._doPublish();
    return result;
  }

  async _openCreateDialog() {
    // Click the + (create) icon in the nav bar
    var createBtn = await this.page.$(
      'svg[aria-label="New post"], svg[aria-label="Create"], ' +
      'a[href*="create"], div[role="button"]:has(svg[aria-label="New post"])'
    );
    if (createBtn) {
      await createBtn.click();
      await smartWait(this.page, null, 2000);
    }

    await smartWait(this.page, null, 1000);
  }

  async _uploadMedia(images, videoPath) {
    // Find the file input element
    var fileInput = await this.page.$(
      'input[type="file"], input[accept*="image"], input[accept*="video"]'
    );

    if (!fileInput) {
      // Click the upload area to trigger file picker
      var uploadArea = await this.page.$(
        'div[role="button"]:has(svg[aria-label="Add photo or video"]), ' +
        'button:has(svg[aria-label="Add photo or video"]), ' +
        'div[class*="upload"], div[class*="dropzone"]'
      );
      if (uploadArea) {
        await uploadArea.click();
        await smartWait(this.page, null, 2000);
        fileInput = await this.page.$('input[type="file"]');
      }
    }

    if (!fileInput) {
      throw new Error('Could not find file input or upload area on Instagram');
    }

    var files = [];
    if (images && images.length > 0) {
      var imgArr = Array.isArray(images) ? images : [images];
      var validImgs = imgArr.filter(function(p) { return typeof p === 'string' && p.length > 0; });
      files = files.concat(validImgs.slice(0, MAX_IMAGES));
    }
    if (videoPath && typeof videoPath === 'string' && videoPath.length > 0) {
      files.push(videoPath);
    }

    if (files.length === 0) {
      throw new Error('No media files provided for Instagram post');
    }

    await fileInput.setInputFiles(files);
    this._progress('Media uploaded, waiting for processing...');
    await smartWait(this.page, null, 3000);

    // Click Next after upload (Instagram has a two-step: crop/adjust then next)
    await this._clickNext();
  }

  async _clickNext() {
    try {
      var nextBtn = await this.page.waitForSelector(
        'div[role="button"]:has-text("Next"), ' +
        'button:has-text("Next"), ' +
        'div[aria-label*="Next"][role="button"], ' +
        'svg[aria-label="Next"]',
        { timeout: 10000 }
      );
      if (nextBtn) {
        await nextBtn.click();
        await smartWait(this.page, null, 2000);
      }
    } catch (e) {
      // Next button may not appear if only one step is needed
    }
  }

  async _writeCaption(article) {
    // Wait for the caption textarea to appear
    await smartWait(this.page, null, 1000);

    var captionArea = await this.page.$(
      'div[aria-label*="caption"][role="textbox"], ' +
      'textarea[aria-label*="caption"], ' +
      'textarea[aria-label*="Caption"], ' +
      'div[role="textbox"][aria-label*="Write"], ' +
      'div[contenteditable="true"]'
    );

    if (!captionArea) {
      // Try finding any text input on the caption page
      captionArea = await this.page.$(
        'div[role="textbox"], textarea:not([type="hidden"])'
      );
    }

    if (!captionArea) {
      throw new Error('Could not locate Instagram caption input');
    }

    await captionArea.click();
    await smartWait(this.page, null, 300);

    // Build caption text
    var plainText = (article.content || '').replace(/<[^>]+>/g, '').trim();
    var fullText = article.title
      ? article.title + '\n\n' + plainText
      : plainText;

    // Instagram caption limit: 2200 characters
    var truncated = fullText.length > MAX_CAPTION_LENGTH
      ? fullText.slice(0, MAX_CAPTION_LENGTH)
      : fullText;

    await captionArea.fill(truncated);
    await smartWait(this.page, null, 500);
  }

  async _doPublish() {
    await smartWait(this.page, null, 1000);

    // Click Share/Post button
    var publishBtn = await this.page.$(
      'div[role="button"]:has-text("Share"), ' +
      'button:has-text("Share"), ' +
      'div[role="button"]:has-text("Post"), ' +
      'button:has-text("Post"), ' +
      'div[aria-label*="Share"][role="button"]'
    );

    if (publishBtn) {
      await publishBtn.click();
      await smartWait(this.page, null, 5000);

      return { success: true, url: this.page.url(), platform: 'instagram' };
    }

    return { success: false, error: 'Could not find Instagram Share/Post button', url: this.page.url(), platform: 'instagram' };
  }
}

module.exports = InstagramPublisher;
