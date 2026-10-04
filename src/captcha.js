// Tiered captcha strategy (blueprint §7) — the heart of the tool.
// 1 none → 2 static image (vision, zoom-3x trick) → 3 reCAPTCHA v2 checkbox
// → 4 interactive (human-in-the-loop default / 2captcha opt-in) → 5 CF walls
// Honeypots are never touched (fields.js routes them out before this module).

import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const CONSENT_SELECTORS = [
  '#onetrust-accept-btn-handler', '#didomi-notice-agree-button',
  'button:has-text("Got it")', 'button:has-text("Accept")', 'button:has-text("I agree")',
  '.fc-cta-consent', '[aria-label="Consent"]',
];

export async function removeCookieBanners(page) {
  // Consent overlays swallow captcha clicks — delete their DOM nodes outright.
  for (const sel of CONSENT_SELECTORS) {
    try {
      const els = page.locator(sel);
      const n = await els.count();
      for (let i = 0; i < Math.min(n, 3); i++) {
        await els.nth(i).evaluate((el) => el.remove()).catch(() => {});
      }
    } catch { /* selector not supported on this page — fine */ }
  }
}

export async function detectCaptcha(page, form) {
  if (form?.hasRecaptchaIframe || await page.locator('iframe[title*="reCAPTCHA"], iframe[src*="recaptcha/api2"]').count()) {
    return { kind: 'recaptcha-v2' };
  }
  if (form?.hasTurnstile || await page.locator('[class*="cf-turnstile"]').count()) {
    return { kind: 'turnstile' };
  }
  const img = page.locator('form img[src*="captcha"], form img[src*="security"], form img[src*="verify"]').first();
  if (await img.count().catch(() => 0)) {
    return { kind: 'image', locator: img };
  }
  // Math captcha rendered as text: "1 + 8 = ?"
  const bodyText = (await page.textContent('form').catch(() => '')) || '';
  const math = bodyText.match(/(\d+)\s*([+\-x*])\s*(\d+)\s*=/);
  if (math) {
    const [a, op, b] = [parseInt(math[1], 10), math[2], parseInt(math[3], 10)];
    const answer = op === '+' ? a + b : op === '-' ? a - b : a * b;
    return { kind: 'math', answer: String(answer) };
  }
  return { kind: 'none' };
}

// ── Tier 2: static image captcha ────────────────────────────────────────────
// Screenshot at CSS scale(3) + image-rendering: pixelated — massive readability
// win on noisy backgrounds. Vision model optional; human prompt is the fallback.
export async function solveImageCaptcha(page, locator, { vision }) {
  const input = page.locator('form input[name*="captcha" i], form input[name*="code" i], form input[name*="verify" i]').first();
  if (!(await input.count().catch(() => 0))) return { solved: false, reason: 'no-captcha-input' };

  if (vision?.enabled) {
    try {
      const buf = await locator.evaluate((el) => {
        el.style.transform = 'scale(3)';
        el.style.transformOrigin = 'top left';
        el.style.imageRendering = 'pixelated';
      }).then(() => locator.screenshot());
      const answer = await visionRead(buf, vision);
      if (answer && answer.length >= 2 && answer.length <= 12) {
        await input.fill(answer);
        return { solved: true, by: 'vision', answer };
      }
    } catch (e) {
      if (process.env.MRAIT_DEBUG) console.error('  vision error:', e.message);
    }
  }
  const human = await promptHuman(`Open the browser tab — type the captcha image answer for me, press Enter after typing it in the form? (or type the answer here)`);
  if (human && human.trim()) {
    await input.fill(human.trim());
    return { solved: true, by: 'human' };
  }
  return { solved: false, reason: 'no-answer' };
}

export async function visionRead(imageBuffer, vision) {
  const res = await fetch(`${vision.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vision.apiKey}` },
    body: JSON.stringify({
      model: vision.model || 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Type the characters shown in this captcha image. Reply with ONLY the characters, nothing else.' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBuffer.toString('base64')}` } },
        ],
      }],
      max_tokens: 20,
    }),
  });
  if (!res.ok) throw new Error(`vision API ${res.status}`);
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim().replace(/\s+/g, '');
}

// ── Tier 3: reCAPTCHA v2 checkbox ───────────────────────────────────────────
export async function solveRecaptchaCheckbox(page) {
  await removeCookieBanners(page);
  for (let attempt = 0; attempt < 2; attempt++) {
    const frame = page.frameLocator('iframe[title*="reCAPTCHA"]').first();
    const box = frame.locator('.recaptcha-checkbox-border').first();
    try {
      await box.waitFor({ state: 'visible', timeout: 5000 });
      await box.click({ timeout: 5000 });
    } catch {
      // anchor-iframe geometry fallback: click at x+25, y+25
      const anchor = page.locator('iframe[title*="reCAPTCHA"]').first();
      const bb = await anchor.boundingBox().catch(() => null);
      if (!bb) return { solved: false, reason: 'no-iframe' };
      await page.mouse.click(bb.x + 25, bb.y + 25);
    }
    await page.waitForTimeout(3000);
    if (await recaptchaTokenPresent(page)) return { solved: true, by: 'auto-click' };
  }
  return { solved: false, reason: 'challenge-appeared' }; // image-grid puzzle → tier 4
}

export async function recaptchaTokenPresent(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[name="g-recaptcha-response"]');
    return !!(el && el.value && el.value.length > 100);
  });
}

// ── Tier 4b: 2Captcha adapter (opt-in only — ToS hazard, see README) ────────
export async function solveRecaptcha2Captcha(page, { siteKey, pageUrl, apiKey }) {
  const submit = await fetch('https://api.2captcha.com/in.php', {
    method: 'POST',
    body: new URLSearchParams({ key: apiKey, method: 'userrecaptcha', googlekey: siteKey, pageurl: pageUrl, json: '1' }),
  }).then((r) => r.json()).catch(() => null);
  if (!submit || submit.status !== 1) return { solved: false, reason: '2captcha-submit-failed' };

  for (let i = 0; i < 24; i++) { // poll up to ~2 min
    await new Promise((r) => setTimeout(r, 5000));
    const poll = await fetch(`https://api.2captcha.com/res.php?key=${apiKey}&action=get&id=${submit.request}&json=1`)
      .then((r) => r.json()).catch(() => null);
    if (poll?.status === 1) {
      await page.evaluate((token) => {
        const el = document.querySelector('[name="g-recaptcha-response"]');
        if (el) el.value = token;
        if (window.___grecaptcha_cfg) {
          for (const id of Object.keys(window.___grecaptcha_cfg.clients)) {
            try { window[`___grecaptcha_cfg_submit_${id}`]?.(token); } catch { /* noop */ }
          }
        }
      }, poll.request);
      return { solved: true, by: '2captcha' };
    }
    if (poll?.request && poll.request !== 'CAPCHA_NOT_READY') return { solved: false, reason: poll.request };
  }
  return { solved: false, reason: '2captcha-timeout' };
}

// ── Tier 4a: human-in-the-loop ──────────────────────────────────────────────
// NEVER navigate away from this tab — a closed tab loses all filled form state.
export async function promptHuman(message) {
  if (!stdin.isTTY) {
    console.log(`  [human step needed] ${message} — but stdin is not a TTY; aborting site.`);
    return null;
  }
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    console.log(`\n┌─ HUMAN STEP ────────────────────────────────────────────`);
    console.log(`│ ${message}`);
    stdout.write('└─ your input (Enter = done): ');
    const answer = await rl.question('');
    console.log('');
    return answer;
  } finally {
    rl.close();
  }
}
