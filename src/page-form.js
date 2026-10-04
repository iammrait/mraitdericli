// DOM extraction helpers (Playwright page → plain data for the pure modules).
import { classifyField } from './fields.js';
import { pickDescription } from './kit.js';

export async function extractForms(page) {
  return page.evaluate(() => {
    function fieldInfo(el) {
      const info = {
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || (el.tagName === 'SELECT' ? 'select-one' : el.tagName === 'TEXTAREA' ? 'textarea' : 'text'),
        name: el.getAttribute('name') || '',
        id: el.id || '',
        required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
        maxLength: el.getAttribute('maxlength') ? parseInt(el.getAttribute('maxlength'), 10) : null,
        visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
      };
      if (el.tagName === 'SELECT') {
        info.options = Array.from(el.options).map((o) => ({ value: o.value, text: o.textContent.trim() }));
      }
      return info;
    }
    return Array.from(document.querySelectorAll('form')).map((form, index) => {
      const controls = Array.from(form.querySelectorAll('input, select, textarea'));
      return {
        index,
        action: form.getAttribute('action') || '',
        method: (form.getAttribute('method') || 'get').toLowerCase(),
        fields: controls.map(fieldInfo),
        buttons: Array.from(form.querySelectorAll('input[type=submit], button')).map((b) => ({
          tag: b.tagName.toLowerCase(),
          type: b.getAttribute('type') || '',
          name: b.getAttribute('name') || '',
          value: b.getAttribute('value') || '',
          id: b.id || '',
          text: (b.textContent || '').trim().slice(0, 60),
          disabled: b.disabled === true,
        })),
        hasRecaptchaIframe: !!document.querySelector('iframe[title*="reCAPTCHA"], iframe[src*="recaptcha"]'),
        hasTurnstile: !!document.querySelector('[class*="cf-turnstile"], input[name="cf-turnstile-response"]'),
        hasCaptchaImg: !!Array.from(form.querySelectorAll('img')).find((i) => /captcha|security|verify/i.test(i.src || '')),
      };
    });
  });
}

// Map extracted fields to kit values; returns {toFill, toCheck, leaveEmpty}
export function mapFields(form, kit, { titleVariant = 0 } = {}) {
  const toFill = [];
  const toCheck = [];
  const seen = new Set();
  for (const f of form.fields) {
    if (!f.visible && f.type !== 'hidden') continue;
    if (f.type === 'hidden' || f.type === 'submit' || f.type === 'button') continue;
    const kind = classifyField(f);
    if (!kind || seen.has(kind)) continue;
    seen.add(kind);
    if (kind === 'honeypot') continue; // MUST STAY EMPTY — fill = silent reject
    if (kind === 'recip') continue; // empty unless user opted in
    if (kind === 'agree') { toCheck.push(f); continue; }
    let value = null;
    switch (kind) {
      case 'title': value = kit.titles[titleVariant % kit.titles.length]; break;
      case 'url': value = kit.site_url; break;
      case 'description':
        value = pickDescription(kit, f.maxLength); break;
      case 'owner_name': value = kit.owner_name || kit.site_name; break;
      case 'email': value = kit.email; break;
      case 'keywords': value = kit.keywords || ''; break;
      case 'meta_desc': value = kit.descriptions[0]; break;
      case 'meta_title': value = kit.titles[0]; break;
      case 'password': value = kit.password; break;
      case 'captcha': continue; // handled by captcha tier
      default: continue;
    }
    if (value != null && value !== '') toFill.push({ field: f, value: String(value) });
  }
  return { toFill, toCheck };
}
