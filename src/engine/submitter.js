import { chromium } from 'playwright';
import { pickBestCategory } from './categoryScorer.js';
import { recordResult } from '../storage/tracker.js';

/**
 * Real-time Directory Submission Engine
 * Implements the operational battle-tested rules from AGENT-BLUEPRINT.md
 */
export class SubmitterEngine {
  constructor(options = {}) {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.isPaused = false;
    this.pendingCaptchaResolver = null;
    this.onProgress = options.onProgress || (() => {});
    this.onCaptchaRequired = options.onCaptchaRequired || (() => {});
    this.aborted = false;
    this.currentDomain = null;
  }

  async init(headed = true) {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: !headed,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
      });
      this.context = await this.browser.newContext({
        viewport: { width: 1366, height: 850 },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      });
      this.page = await this.context.newPage();
    }
  }

  async close() {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (_) {}
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  abort() {
    this.aborted = true;
    if (this.pendingCaptchaResolver) {
      this.pendingCaptchaResolver(false);
      this.pendingCaptchaResolver = null;
    }
  }

  signalCaptchaDone() {
    if (this.pendingCaptchaResolver) {
      this.pendingCaptchaResolver(true);
      this.pendingCaptchaResolver = null;
    }
  }

  async runBatch(queue, kit, options = {}) {
    this.aborted = false;
    await this.init(options.headed !== false);

    const maxSites = options.maxSites || kit.max_per_session || 25;
    let processed = 0;
    const results = [];

    for (let i = 0; i < queue.length && processed < maxSites; i++) {
      if (this.aborted) break;

      const item = queue[i];
      this.currentDomain = item.domain;
      this.onProgress({
        type: 'site_start',
        index: processed + 1,
        total: Math.min(queue.length, maxSites),
        domain: item.domain,
        submit_url: item.submit_url,
      });

      const outcome = await this.submitSingle(item, kit, processed);
      results.push(outcome);
      recordResult(outcome);

      this.onProgress({
        type: 'site_end',
        index: processed + 1,
        total: Math.min(queue.length, maxSites),
        domain: item.domain,
        outcome,
      });

      processed++;

      // Polite pacing: 3 to 5 second pause between directories
      if (i < queue.length - 1 && !this.aborted) {
        await new Promise((r) => setTimeout(r, 3500));
      }
    }

    return results;
  }

  async submitSingle(item, kit, siteIndex = 0) {
    const submitUrl = item.submit_url || item.url;
    const domain = item.domain || new URL(submitUrl).hostname.replace(/^www\./, '');

    const outcome = {
      domain,
      url: item.url || `https://${domain}`,
      submit_url: submitUrl,
      category: item.category || 'General',
      type: item.type || 'standard',
      status: 'PENDING',
      http_status: '200',
      submitted: 'no',
      date: new Date().toISOString().split('T')[0],
      notes: '',
    };

    try {
      // 1. Visit homepage first to establish session cookies (prevents 403 blocks)
      const homeUrl = `https://${domain}`;
      try {
        await this.page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await this.page.waitForTimeout(1000);
      } catch (_) {
        // Fallback to http if https fails
        try {
          await this.page.goto(`http://${domain}`, { waitUntil: 'domcontentloaded', timeout: 12000 });
        } catch (_) {}
      }

      // 2. Navigate to Submit URL with timeout handling
      let res;
      try {
        res = await this.page.goto(submitUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      } catch (err) {
        if (submitUrl.startsWith('https://')) {
          const fallback = submitUrl.replace('https://', 'http://');
          res = await this.page.goto(fallback, { waitUntil: 'domcontentloaded', timeout: 20000 });
        } else {
          throw err;
        }
      }

      if (res) outcome.http_status = String(res.status());

      // Check if parked/blank domain
      const pageText = await this.page.evaluate(() => document.body.innerText || '');
      if (pageText.length < 50) {
        outcome.status = 'FAILED';
        outcome.notes = 'DEAD-blank (Empty body)';
        return outcome;
      }
      if (/domain is for sale|parked domain|buy this domain|domain renewal/i.test(pageText)) {
        outcome.status = 'FAILED';
        outcome.notes = 'DEAD-parked';
        return outcome;
      }

      // 2. Remove cookie consent banners that swallow clicks
      await this.page.evaluate(() => {
        const selectors = [
          '#cookie-notice',
          '.cookie-banner',
          '.cc-window',
          '#onetrust-banner-sdk',
          '.cookie-consent',
          '[id*="cookie"]',
          '[class*="cookie"]',
        ];
        selectors.forEach((sel) => {
          document.querySelectorAll(sel).forEach((el) => el.remove());
        });
      });

      // 3. Inspect Link-Type Radios (Free vs Paid)
      const radioCheck = await this.page.evaluate(() => {
        const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
        if (radios.length === 0) return { hasRadios: false, allPaid: false };

        const radioInfos = radios.map((r) => {
          const rowText = (r.closest('tr')?.innerText || r.parentElement?.innerText || '').toLowerCase();
          const isFree = /free|regular|standard|normal|\$0/i.test(rowText);
          const isPaid = /\$|\bfee\b|\bpaid\b/i.test(rowText) && !isFree;
          return { element: r, isFree, isPaid, rowText };
        });

        // Click the first free / regular radio
        const freeRadio = radioInfos.find((ri) => ri.isFree);
        if (freeRadio) {
          freeRadio.element.click();
          return { hasRadios: true, allPaid: false, selectedFree: true };
        }

        // Check if every radio is explicitly paid
        const allPaid = radioInfos.length > 0 && radioInfos.every((ri) => ri.isPaid);
        if (allPaid) {
          return { hasRadios: true, allPaid: true };
        }

        // Fallback: select last radio (conventionally free/regular in phpLD)
        radios[radios.length - 1].click();
        return { hasRadios: true, allPaid: false };
      });

      if (radioCheck.allPaid) {
        outcome.status = 'SKIPPED';
        outcome.notes = 'PAID-gated (No free tier)';
        return outcome;
      }

      // 4. Select Category
      const categorySelected = await this.selectCategory(kit.category_keywords || []);
      if (categorySelected) outcome.category = categorySelected;

      // 5. Fill Form Fields
      const titleVariant = kit.titles[siteIndex % kit.titles.length] || kit.titles[0] || kit.site_name;
      const descVariant =
        kit.descriptions[siteIndex % kit.descriptions.length] || kit.descriptions[0] || kit.site_name;

      await this.fillFields({
        title: titleVariant,
        url: kit.site_url,
        description: descVariant,
        owner_name: kit.site_name,
        email: kit.email,
        keywords: kit.keywords || '',
        password: kit.password || 'Sub!2026Link#',
      });

      // 6. Handle Captchas
      const captchaStatus = await this.handleCaptcha(domain);
      if (captchaStatus === 'ABORTED') {
        outcome.status = 'CANCELLED';
        outcome.notes = 'Run cancelled by user';
        return outcome;
      }
      if (captchaStatus === 'SKIPPED') {
        outcome.status = 'SKIPPED';
        outcome.notes = 'CAPTCHA-skipped by user';
        return outcome;
      }

      // 7. Find and Click Submit Button
      const submittedClicked = await this.clickSubmitButton();
      if (!submittedClicked) {
        outcome.status = 'FAILED';
        outcome.notes = 'NO-FORM (Submit button not found)';
        return outcome;
      }

      // 8. Wait for response & Detect Outcome
      await this.page.waitForTimeout(4000);

      const outcomeResult = await this.detectOutcome();
      outcome.status = outcomeResult.status;
      outcome.submitted = outcomeResult.submitted ? 'yes' : 'no';
      outcome.notes = outcomeResult.notes;

      // Uniqueness retry check: if title already exists, rotate title variant and retry once
      if (outcome.notes.includes('not unique') || outcome.notes.includes('already been submitted')) {
        const nextTitle = kit.titles[(siteIndex + 1) % kit.titles.length];
        if (nextTitle && nextTitle !== titleVariant) {
          await this.fillFieldByName('title', nextTitle);
          await this.clickSubmitButton();
          await this.page.waitForTimeout(4000);
          const retryOutcome = await this.detectOutcome();
          outcome.status = retryOutcome.status;
          outcome.submitted = retryOutcome.submitted ? 'yes' : 'no';
          outcome.notes = `Retried with alt title: ${retryOutcome.notes}`;
        }
      }

      return outcome;
    } catch (err) {
      outcome.status = 'FAILED';
      outcome.notes = `ERROR: ${err.message.slice(0, 100)}`;
      return outcome;
    }
  }

  async selectCategory(categoryKeywords) {
    try {
      const selects = await this.page.$$('select');
      for (const sel of selects) {
        const isCatSelect = await sel.evaluate((el) => {
          const name = (el.name || el.id || '').toLowerCase();
          return (
            name.includes('cat') ||
            name.includes('category') ||
            name.includes('cid') ||
            el.options.length > 5
          );
        });

        if (isCatSelect) {
          const options = await sel.evaluate((el) => {
            return Array.from(el.options)
              .map((opt) => ({
                value: opt.value,
                text: opt.text,
              }))
              .filter((o) => o.value && o.value !== '0' && o.value !== '-1' && !/^(--|select|choose)/i.test(o.text.trim()));
          });

          const best = pickBestCategory(options, categoryKeywords);
          if (best && best.value) {
            await sel.selectOption(best.value);
            return best.text.replace(/^[|\s_-]+/, '').trim();
          }
        }
      }
    } catch (_) {}
    return null;
  }

  async fillFields(data) {
    await this.page.evaluate((d) => {
      const inputs = Array.from(document.querySelectorAll('input, textarea'));

      for (const input of inputs) {
        const type = (input.type || '').toLowerCase();
        const name = (input.name || '').toLowerCase();
        const id = (input.id || '').toLowerCase();
        const key = `${name} ${id}`;

        // Honeypot fields: Leave strictly empty!
        if (
          key.includes('confirm') ||
          key.includes('honeypot') ||
          key.includes('website_confirm') ||
          key.includes('stopbrowser')
        ) {
          input.value = '';
          continue;
        }

        // Agree terms checkbox
        if (type === 'checkbox' && (key.includes('agree') || key.includes('tos') || key.includes('term') || key.includes('rule'))) {
          input.checked = true;
          continue;
        }

        // Title
        if (!key.includes('recip') && (/^title$/i.test(name) || key.includes('site_title') || key.includes('linkname') || key.includes('listing_title'))) {
          input.value = d.title;
          continue;
        }

        // URL
        if (!key.includes('recip') && (/^url$/i.test(name) || key.includes('site_url') || key.includes('linkurl') || key.includes('website_url') || key.includes('listing_url'))) {
          input.value = d.url;
          continue;
        }

        // Description
        if (/^description$/i.test(name) || key.includes('site_desc') || key.includes('listing_desc') || input.tagName === 'TEXTAREA') {
          input.value = d.description;
          continue;
        }

        // Owner Name
        if (key.includes('owner_name') || key.includes('your_name') || key.includes('contact_name') || key.includes('sname')) {
          input.value = d.owner_name;
          continue;
        }

        // Email
        if (type === 'email' || key.includes('owner_email') || /^email$/i.test(name) || key.includes('email_add') || key.includes('your-email')) {
          input.value = d.email;
          continue;
        }

        // Keywords
        if (key.includes('keyword')) {
          input.value = d.keywords;
          continue;
        }

        // Password
        if (type === 'password') {
          input.value = d.password;
          continue;
        }
      }
    }, data);
  }

  async fillFieldByName(fieldName, value) {
    try {
      await this.page.evaluate(
        ({ fn, val }) => {
          const input = Array.from(document.querySelectorAll('input, textarea')).find((el) => {
            const key = `${el.name || ''} ${el.id || ''}`.toLowerCase();
            return key.includes(fn);
          });
          if (input) input.value = val;
        },
        { fn: fieldName, val: value }
      );
    } catch (_) {}
  }

  async handleCaptcha(domain) {
    // 1. Math Captcha ("1 + 8 = ?")
    const solvedMath = await this.page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('label, span, td, div'));
      for (const el of labels) {
        const text = el.innerText || '';
        const match = text.match(/(\d+)\s*([\+\-\*])\s*(\d+)\s*=/);
        if (match) {
          const n1 = parseInt(match[1], 10);
          const op = match[2];
          const n2 = parseInt(match[3], 10);
          let ans = 0;
          if (op === '+') ans = n1 + n2;
          if (op === '-') ans = n1 - n2;
          if (op === '*') ans = n1 * n2;

          const input = el.parentElement?.querySelector('input') || document.querySelector('input[name*="captcha" i]');
          if (input) {
            input.value = String(ans);
            return true;
          }
        }
      }
      return false;
    });

    if (solvedMath) return 'SOLVED_MATH';

    // 2. reCAPTCHA v2 Checkbox
    const recaptchaFrame = this.page.frameLocator('iframe[title*="reCAPTCHA" i]').first();
    const checkbox = recaptchaFrame.locator('.recaptcha-checkbox-border');
    if ((await checkbox.count()) > 0) {
      try {
        await checkbox.click({ timeout: 4000 });
        await this.page.waitForTimeout(2000);

        const isSolved = await this.page.evaluate(() => {
          const token = document.querySelector('[name="g-recaptcha-response"]')?.value || '';
          return token.length > 50;
        });

        if (isSolved) return 'SOLVED_RECAPTCHA_AUTO';
      } catch (_) {}

      // If not auto-solved, it raised an interactive challenge!
      // Trigger friendly Human-In-The-Loop pause
      this.onCaptchaRequired({
        domain,
        message: `Interactive Captcha detected on ${domain}. Please solve the captcha in the open browser window, then click Continue.`,
      });

      // Wait for user to click Continue on the Web UI
      const userResponded = await new Promise((resolve) => {
        this.pendingCaptchaResolver = resolve;
      });

      return userResponded ? 'SOLVED_HUMAN' : 'SKIPPED';
    }

    // 3. Generic Captcha Input found
    const hasCaptchaInput = await this.page.evaluate(() => {
      return Boolean(document.querySelector('input[name*="captcha" i], input[name*="code" i], img[src*="captcha" i]'));
    });

    if (hasCaptchaInput) {
      this.onCaptchaRequired({
        domain,
        message: `Captcha found on ${domain}. Please enter the code in the browser window and click Continue.`,
      });

      const userResponded = await new Promise((resolve) => {
        this.pendingCaptchaResolver = resolve;
      });

      return userResponded ? 'SOLVED_HUMAN' : 'SKIPPED';
    }

    return 'NONE';
  }

  async clickSubmitButton() {
    return await this.page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('input[type="submit"], button[type="submit"], button, input[type="button"]'));
      for (const btn of candidates) {
        const val = (btn.value || btn.innerText || btn.name || '').toLowerCase();
        if (
          (val.includes('submit') || val.includes('continue') || val.includes('add') || val.includes('save')) &&
          !val.includes('cancel') &&
          !val.includes('reset') &&
          !val.includes('preview')
        ) {
          btn.click();
          return true;
        }
      }
      return false;
    });
  }

  async detectOutcome() {
    const url = this.page.url();
    const text = (await this.page.evaluate(() => document.body.innerText || '')).toLowerCase();

    // Success patterns
    const successRegex =
      /submitted and awaiting approval|thank you for your link|submission received|link submitted|site submitted successfully|has been added|listing was successfully added|received and will be reviewed/i;

    if (successRegex.test(text) || /\/(thank|confirm|success|result)/i.test(url)) {
      return { status: 'SUCCESS', submitted: true, notes: 'OK - Awaiting approval' };
    }

    // Failure patterns
    if (text.includes('invalid code') || text.includes('incorrect security code') || text.includes('captcha was not')) {
      return { status: 'FAILED', submitted: false, notes: 'CAPTCHA-failed' };
    }
    if (text.includes('not unique') || text.includes('already been submitted') || text.includes('already listed')) {
      return { status: 'FAILED', submitted: false, notes: 'DUPLICATE (Already submitted)' };
    }
    if (url.includes('payment.php') || url.includes('paypal.com') || url.includes('/checkout')) {
      return { status: 'SKIPPED', submitted: false, notes: 'PAID-gated (Redirected to payment page)' };
    }
    const isPaymentDemand = await this.page.evaluate(() => {
      const h = Array.from(document.querySelectorAll('h1, h2, h3, .title, .header')).map((e) => e.innerText.toLowerCase());
      return h.some((t) => t.includes('make a payment') || t.includes('complete payment') || t.includes('checkout'));
    });
    if (isPaymentDemand) {
      return { status: 'SKIPPED', submitted: false, notes: 'PAID-gated (Payment demanded)' };
    }
    if (text.includes('error occured') || text.includes('an error occurred')) {
      return { status: 'FAILED', submitted: false, notes: 'BROKEN-server-error' };
    }

    // If still showing the form without message
    const stillHasForm = await this.page.evaluate(() => Boolean(document.querySelector('form input[name*="url" i]')));
    if (stillHasForm) {
      return { status: 'UNCONFIRMED', submitted: false, notes: 'Form still present / unconfirmed' };
    }

    return { status: 'SUCCESS', submitted: true, notes: 'OK (Submitted, confirmation URL)' };
  }
}
