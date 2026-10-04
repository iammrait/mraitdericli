// Field-name mapping table (blueprint §5) — accumulated the hard way.
// Match by regex on input name/id/placeholder, case-insensitive, first hit wins.
// Order matters: honeypot and reciprocal checks run BEFORE generic url matching.

const PATTERNS = [
  ['honeypot', [/website_confirm/i, /stopbrowserautofill/i, /leave.?empty/i, /^hp[_-]/i]],
  ['recip', [/^recip_url$/i, /^recpr_url$/i, /^reciprocal/i]],
  ['title', [/^title$/i, /site_title/i, /^linkname$/i, /listing.*title/i, /edt.*title/i, /^link_title$/i]],
  ['url', [/^url$/i, /^site_url$/i, /^linkurl$/i, /website_url/i, /listing.*url/i, /^link_url$/i]],
  ['description', [/^description$/i, /^site_desc/i, /descriere/i, /listing.*desc/i]],
  ['meta_desc', [/meta_description/i]],
  ['meta_title', [/meta_title/i]],
  ['owner_name', [/owner_name/i, /your_name/i, /^sname$/i, /^cname$/i, /contact.*name/i, /^owner$/i]],
  ['email', [/owner_email/i, /^email/i, /email_add/i, /your-email/i]],
  ['keywords', [/meta_keywords/i, /^keywords$/i]],
  ['agree', [/agreerules/i, /^agree/i, /acceptterms/i, /^tos$/i]],
  ['password', [/password1/i, /password2/i, /^password$/i]],
  ['captcha', [/^captcha/i, /captcha_?code/i, /verification_?code/i, /image_?code/i, /security_?code/i]],
];

export function classifyField(cand) {
  const s = `${cand.name || ''} ${cand.id || ''}`;
  for (const [kind, regexes] of PATTERNS) {
    for (const re of regexes) {
      if (re.test(s)) {
        // 'url' must never swallow reciprocal fields
        if (kind === 'url' && /recip/i.test(s)) return null;
        return kind;
      }
    }
  }
  return null;
}

export function isHoneypot(field) {
  return classifyField(field) === 'honeypot';
}
