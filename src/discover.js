// Submit-URL discovery (blueprint §3 step 1): homepage → find <a> matching
// submit|add[-_]?url|suggest|add[-_]?link — prefer category-scoped links.
// Falls back to common paths before resorting to the browser.

const LINK_RE = /submit|add[-_]?url|add[-_]?link|add[-_]?site|suggest/i;
const COMMON_PATHS = ['/submit.php', '/submit', '/add-url.html', '/add_url.php', '/add-site.html', '/submit-link.php', '/add-listing'];

export async function discoverSubmitUrl(domain, { timeoutMs = 10000 } = {}) {
  const base = `https://${domain}`;
  const { html, finalUrl } = await fetchHTML(base, timeoutMs).catch(() => ({ html: '', finalUrl: '' }));
  if (html) {
    const links = [...html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]{0,80}?)<\/a>/gi)]
      .map((m) => ({ href: m[1], text: m[2].replace(/<[^>]*>/g, ' ').trim() }))
      .filter((l) => LINK_RE.test(l.href) || LINK_RE.test(l.text));
    if (links.length) {
      const scored = links.map((l) => ({
        l,
        score: (/submit/i.test(l.href) ? 2 : 0) + (/submit/i.test(l.text) ? 2 : 0) + (/c=\d+|category/i.test(l.href) ? 1 : 0),
      })).sort((a, b) => b.score - a.score);
      try {
        return new URL(scored[0].l.href, finalUrl || base).href;
      } catch { /* malformed href — fall through */ }
    }
  }
  // Probe common paths
  for (const p of COMMON_PATHS) {
    const probe = await fetchHTML(base + p, 6000, { method: 'GET' }).catch(() => null);
    if (probe && probe.status === 200 && probe.html.length > 500 && /<form/i.test(probe.html)) {
      return base + p;
    }
  }
  return '';
}

export async function fetchHTML(url, timeoutMs = 10000, { method = 'GET' } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, method, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MrAitDirectory/0.1' } });
    const html = await res.text();
    return { html, status: res.status, finalUrl: res.url };
  } finally {
    clearTimeout(t);
  }
}
