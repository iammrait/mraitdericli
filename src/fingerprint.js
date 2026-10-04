// Form fingerprinting (blueprint §4) — pure classification on a form description.
// DOM extraction lives in page-form.js; this module routes to the right handler.

/**
 * form info shape (from page-form.js extractForms):
 * {
 *   index, action, method,
 *   fields: [{ tag, type, name, id, required, maxLength, options? }],
 *   hidden: [{name, value}],
 *   buttons: [{ tag, type, name, value, id, text }],
 *   hasRecaptchaIframe, hasTurnstile, hasCaptchaImg,
 * }
 */
export function fingerprintForm(form) {
  const names = form.fields.map((f) => `${f.name} ${f.id}`.toLowerCase());
  const has = (re) => names.some((n) => re.test(n));
  const types = new Set(form.fields.map((f) => f.type));

  const napSignals = [/address/, /city/, /phone/, /^zip/, /postal/, /state/, /country/, /hours/]
    .filter((re) => has(re)).length;
  const listingCore = ['title', 'url', 'description'].filter((k) =>
    has(k === 'title' ? /title/ : k === 'url' ? /(^|[^a-z])url/ : /desc/)
  ).length;

  if (napSignals >= 3 && listingCore >= 2) return 'nap';

  if (has(/user(name)?|login|register/) && listingCore === 0 && types.has('password')) {
    return 'login-required';
  }

  // phpLD wizard-gate: only hidden CATEGORY_ID + a "Go To Step Two/Three" gate button
  const gateButton = form.buttons.find((b) =>
    /^ok$/i.test(b.id || '') || /go to step|step two|step three/i.test(b.value || b.text || '')
  );
  const hiddenCat = form.hidden.find((h) => /category_id/i.test(h.name));
  const visibleInputs = form.fields.filter((f) => f.type !== 'hidden');
  if (gateButton && hiddenCat && visibleInputs.length <= 2) return 'wizard-gate';

  if (has(/category_id|cat_id|categor/) && (types.has('select-one') || form.fields.some((f) => f.tagName === 'SELECT'))) {
    if (has(/owner|email|description/)) return 'phpld-classic';
  }
  if (listingCore >= 2) {
    if (form.action && /c=\d+/i.test(form.action)) return 'category-first';
    return 'custom';
  }
  return 'unknown';
}
