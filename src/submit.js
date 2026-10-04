// Submitting + result reading (blueprint §8-9). Boring but critical.

import { detectOutcome, isConfirmationUrl } from './results.js';

// Pick the RIGHT submit button — never .last() blindly. Search "GO",
// preview and reset buttons have hijacked submissions before.
export function pickSubmitButton(buttons) {
  const candidates = buttons.filter((b) => !b.disabled && b.type !== 'button' && b.type !== 'reset');
  const good = candidates.find((b) =>
    /^(submit|continue|send)$/i.test(b.name || '') ||
    /^(submit|continue|send|add (link|site|listing)|submit (link|site|listing)|next)/i.test(b.value || b.text || '')
  );
  if (good) return good;
  const okFallback = candidates.find((b) => b.type === 'submit');
  return okFallback || null;
}

export async function fillAndSubmit(page, formIndex, { toFill, toCheck, button }) {
  const form = page.locator('form').nth(formIndex);
  for (const { field, value } of toFill) {
    const sel = field.name ? `[name="${field.name}"]` : `#${field.id}`;
    const loc = form.locator(sel).first();
    try {
      await loc.fill(value, { timeout: 5000 });
    } catch {
      await loc.fill(value, { timeout: 5000, force: true }).catch(() => {});
    }
  }
  for (const f of toCheck) {
    const sel = f.name ? `[name="${f.name}"]` : `#${f.id}`;
    await form.locator(sel).first().check({ timeout: 3000 }).catch(() => {});
  }
  if (!button) return { clicked: false };

  const btnSel = button.name
    ? `[name="${button.name}"]`
    : button.id ? `#${button.id}` : null;
  const btnLoc = btnSel
    ? form.locator(`input[type=submit]${btnSel}, button${btnSel}`).first()
    : form.locator('input[type=submit], button[type=submit], button').first();

  const pagesBefore = page.context().pages().length;
  try {
    await btnLoc.click({ timeout: 5000 });
  } catch {
    // JS-gated forms: page-side click sometimes works when automation click times out
    const clicked = await btnLoc.evaluate((el) => el.click()).catch(() => false);
    if (!clicked) return { clicked: false };
  }

  // "PLEASE WAIT" means the server is processing (slow dirs take 30s+)
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // target="_blank" forms: the result opens in a NEW tab — read it there.
  const pages = page.context().pages();
  const resultPage = pages.length > pagesBefore ? pages[pages.length - 1] : page;
  if (resultPage !== page) {
    await resultPage.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
  }
  return { clicked: true, resultPage };
}

export async function readOutcome(resultPage, formStillPresent) {
  const url = resultPage.url();
  const body = (await resultPage.textContent('body').catch(() => '')) || '';
  if (body.trim().length === 0) {
    return { kind: 'failure', matched: 'blank-body' };
  }
  const outcome = detectOutcome(body);
  // "CAPTCHA was completed successfully" only counts if the form disappeared
  if (/captcha was completed successfully/i.test(body) && formStillPresent && outcome.kind === 'success') {
    return { kind: 'unknown', matched: 'captcha-ok-but-form-still-present' };
  }
  if (outcome.kind === 'unknown' && isConfirmationUrl(url)) {
    return { kind: 'success', matched: 'confirmation-url' };
  }
  return outcome;
}

export async function formStillOnPage(page, formIndex) {
  return page.locator('form').nth(formIndex).isVisible().catch(() => false);
}
