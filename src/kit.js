// Submission kit: the wording + credentials used on every form.
// Consistency across listings is itself a trust signal — validate hard, warn early.

import fs from 'node:fs';

export function loadKit(kitPath) {
  const raw = JSON.parse(fs.readFileSync(kitPath, 'utf-8'));
  return validateKit(raw, kitPath);
}

export function validateKit(k, src = 'kit') {
  const problems = [];
  const warnings = [];

  for (const key of ['site_url', 'site_name', 'email', 'password']) {
    if (!k[key] || typeof k[key] !== 'string') problems.push(`missing required field: ${key}`);
  }
  if (!Array.isArray(k.titles) || k.titles.length < 2) {
    problems.push('titles: need at least 2 variants (uniqueness errors require rotation)');
  }
  if (!Array.isArray(k.descriptions) || k.descriptions.length < 1) {
    problems.push('descriptions: need at least 1 variant');
  }
  if (k.site_url && !/^https?:\/\//.test(k.site_url)) problems.push('site_url must start with http(s)://');
  if (k.email && k.site_url) {
    const dom = k.site_url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '');
    if (!k.email.endsWith('@' + dom)) {
      warnings.push(`email ${k.email} does not match site domain ${dom} — some directories require it (warn, not block)`);
    }
  }
  const descs = k.descriptions || [];
  const lens = descs.map((d) => d.length);
  if (descs.length && Math.max(...lens) < 150) warnings.push('all descriptions under 150 chars — some directories require 200+; add a long variant');
  if (descs.length && Math.min(...lens) > 300) warnings.push('all descriptions over 300 chars — some forms cap at 255; add a short variant');
  if (!k.category_keywords || !k.category_keywords.length) warnings.push('no category_keywords — category picking will be weak, editors reject mismatches');

  if (problems.length) {
    throw new Error(`Invalid kit (${src}):\n  - ${problems.join('\n  - ')}`);
  }

  return {
    captcha_mode: 'human-in-the-loop',
    max_per_session: 25,
    delay_ms: 15000,
    ...k,
    _warnings: warnings,
  };
}

// Pick the longest description that fits a form's maxlength (min 1 char).
export function pickDescription(kit, maxlength) {
  const fits = kit.descriptions.filter((d) => !maxlength || d.length <= maxlength);
  if (!fits.length) return kit.descriptions.reduce((a, b) => (a.length < b.length ? a : b));
  return fits.reduce((a, b) => (a.length >= b.length ? a : b));
}
