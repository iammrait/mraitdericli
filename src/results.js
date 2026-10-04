// Result detection (blueprint §9) — success vs failure vs paid vs unknown.
// Directories misspell ("error occured"), show zero feedback, or demand payment
// mid-flow. Match conservatively; ambiguity is resolved by the engine.

const SUCCESS = [
  /submitted and awaiting approval/i,
  /thank you for your link submission/i,
  /submission (was )?received/i,
  /link submitted/i,
  /site submitted successfully/i,
  /has been (added|submitted)/i,
  /listing (has been )?(added|submitted|received)/i,
  /successfully (added|submitted)/i,
  /your (site|link|listing) (has been|was) submitted/i,
  /captcha was completed successfully/i, // caller checks the form disappeared too
];

const FAILURE = [
  /error occured/i,
  /error occurred/i,
  /invalid (code|captcha|image)/i,
  /incorrect (code|captcha)/i,
  /wrong (code|captcha)/i,
  /not unique/i,
  /already (been )?submitted/i,
  /you must agree/i,
  /account suspended/i,
  /\b508\b/,
];

const PAID = [
  /payment (is )?required/i,
  /please (choose|select) a payment/i,
  /proceed to payment/i,
  /complete (the )?payment/i,
  /paypal/i,
  /checkout/i,
  /\/payment\.php/i,
  /\$\s?\d/,
];

const ACTIVATION = [
  /confirm(ation)? (your )?email/i,
  /email (confirmation|verification) required/i,
  /activation (email|link) (has been |was )?sent/i,
  /check your email/i,
];

export function detectOutcome(bodyText) {
  const t = (bodyText || '').slice(0, 20000);
  for (const re of PAID) if (re.test(t)) return { kind: 'paid', matched: re.source };
  for (const re of SUCCESS) if (re.test(t)) return { kind: 'success', matched: re.source };
  for (const re of ACTIVATION) if (re.test(t)) return { kind: 'activation', matched: re.source };
  for (const re of FAILURE) if (re.test(t)) return { kind: 'failure', matched: re.source };
  return { kind: 'unknown', matched: null };
}

// "Title is not unique in the parent category" → rotate to the next title variant.
export function needsTitleRotation(bodyText) {
  return /not unique|already (been )?submitted|title (already )?exists/i.test(bodyText || '');
}

export function isConfirmationUrl(url) {
  return /\/(submit-result|thank|landing|confirm)/i.test(url || '');
}
