// Category selection by option-text scoring (blueprint §6).
// Editors reject mismatched and uncategorized submissions — never pick blindly.

const GENERIC_LADDER = [
  [/employ|career|job/i, 2.0],
  [/education|training|vocational/i, 1.5],
  [/reference|society|government|business/i, 1.0],
];

const UNCATEGORIZED = /^(top|root|other|none|uncategorized|general)?[_\s|]*$/i;

function nestingDepth(text) {
  // phpLD renders depth as "| |___Job and Employment Resources"
  const markers = (text.match(/___/g) || []).length + (text.match(/\|/g) || []).length;
  return Math.min(markers, 5);
}

export function scoreOption(text, categoryKeywords) {
  if (!text || UNCATEGORIZED.test(text.trim())) return -1;
  const t = text.toLowerCase();
  let score = 0;
  for (const kw of categoryKeywords) {
    if (kw && t.includes(String(kw).toLowerCase())) score += 3;
  }
  for (const [re, weight] of GENERIC_LADDER) {
    if (re.test(t)) score += weight;
  }
  score += nestingDepth(text) * 0.25; // prefer the deepest matching option
  return score;
}

/**
 * Pick the best <option> from a list of {value, text}.
 * Returns null when nothing scores — caller decides whether to skip the site
 * or browse the category page first (category-first engines).
 */
export function pickCategory(options, categoryKeywords) {
  let best = null;
  let bestScore = 0;
  options.forEach((opt, index) => {
    if (opt.value === '' || opt.value === '0') return; // placeholder / "select one"
    const s = scoreOption(opt.text, categoryKeywords);
    if (s > bestScore) { best = { index, ...opt, score: s }; bestScore = s; }
  });
  return best;
}

// Radio options for link-type picks (blueprint §5 traps):
// labels are often empty; "normal" is frequently the PAID tier.
export function pickLinkTypeRadio(radios) {
  // radios: [{value, labelText, price?}]
  const free = radios.find((r) => /free|regular(?!.*\$)/i.test(r.labelText) && !/\$|price|paid|featured|sponsor/i.test(r.labelText));
  if (free) return free;
  const notPaid = radios.filter((r) => !/\$|\d+\.\d{2}|paid|featured|sponsor/i.test(r.labelText));
  if (notPaid.length) return notPaid[notPaid.length - 1]; // last non-paid radio is usually free
  return radios[radios.length - 1] || null; // last resort: LAST radio, then verify no payment.php
}
