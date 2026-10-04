import * as cheerio from 'cheerio';

/**
 * Extracts and automatically crafts submission data from any website URL.
 * Designed so non-technical users just provide their website URL and email.
 */
export async function extractSiteMetadata(targetUrl) {
  let url = targetUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (err) {
    throw new Error(`Invalid URL: ${targetUrl}`);
  }

  const hostname = parsedUrl.hostname.replace(/^www\./i, '');
  const domainParts = hostname.split('.');
  const rawBrand = domainParts[0].charAt(0).toUpperCase() + domainParts[0].slice(1);

  // Fetch website HTML
  let html = '';
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      console.warn(`Fetch returned status ${res.status}, continuing with fallback metadata`);
    } else {
      html = await res.text();
    }
  } catch (err) {
    console.warn(`Fetch error for ${url}: ${err.message}. Generating based on domain.`);
  }

  const $ = cheerio.load(html || '<html><head></head><body></body></html>');

  const pageTitle = ($('title').text() || $('meta[property="og:title"]').attr('content') || '').trim();
  const metaDesc = (
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="twitter:description"]').attr('content') ||
    ''
  ).trim();
  const ogSiteName = ($('meta[property="og:site_name"]').attr('content') || '').trim();
  const metaKeywords = ($('meta[name="keywords"]').attr('content') || '').trim();

  // Extract top headings and paragraphs for richer description generation
  const h1 = $('h1').first().text().trim().replace(/\s+/g, ' ');
  const h2 = $('h2').first().text().trim().replace(/\s+/g, ' ');
  const firstP = $('p').filter((_, el) => $(el).text().trim().length > 40).first().text().trim().replace(/\s+/g, ' ');

  // Determine Brand Name
  let siteName = ogSiteName;
  if (!siteName && pageTitle) {
    const parts = pageTitle.split(/[-–|:•]/);
    if (parts.length > 1 && parts[0].trim().length < 30) {
      siteName = parts[0].trim();
    } else if (parts.length > 1 && parts[parts.length - 1].trim().length < 30) {
      siteName = parts[parts.length - 1].trim();
    }
  }
  if (!siteName) {
    siteName = rawBrand;
  }

  // Determine Tagline / Core Topic
  let topic = pageTitle;
  if (topic.includes('-')) topic = topic.split('-').slice(1).join('-').trim();
  else if (topic.includes('|')) topic = topic.split('|').slice(1).join('|').trim();
  if (!topic || topic.length < 5) {
    topic = h1 || h2 || `${siteName} Online Services & Resources`;
  }
  topic = topic.replace(/\s+/g, ' ').slice(0, 60).trim();

  // Craft 3 Distinct Title Variants (within 25-65 chars)
  const title1 = `${siteName} - ${topic}`.slice(0, 65).replace(/[-|\s]+$/, '');
  const title2 = `${siteName} | ${h1 || topic}`.slice(0, 65).replace(/[-|\s]+$/, '');
  const title3 = `${siteName} Official Website & Resources`.slice(0, 65);

  // Craft 3 Tiered Descriptions (Short, Medium 200+ chars, Long 300+ chars)
  let baseDesc = metaDesc || firstP || `${siteName} provides high quality online resources, tools, and services. Visit the official website to explore features, guides, and up-to-date information.`;
  baseDesc = baseDesc.replace(/\s+/g, ' ').trim();

  // Short (120 - 150 chars)
  let descShort = baseDesc.slice(0, 140);
  if (descShort.length < 80) {
    descShort = `${siteName} provides trusted resources, services, and online tools. Discover guides, updates, and direct contact details online.`;
  }
  if (!/[.!?]$/.test(descShort)) descShort += '.';

  // Medium (210 - 250 chars) - crucial for directories with 200 min-char rules
  let descMedium = baseDesc;
  if (descMedium.length < 210) {
    descMedium = `${baseDesc} Find comprehensive details, professional guidance, and tools designed for users seeking accurate, reliable solutions. Visit ${hostname} today to get started.`;
  }
  descMedium = descMedium.slice(0, 250);
  if (!/[.!?]$/.test(descMedium)) descMedium += '.';

  // Long (310 - 360 chars)
  let descLong = `${descMedium} Designed with accuracy and user trust in mind, exploring official updates, informative guides, and verified support.`;
  if (descLong.length < 310) {
    descLong += ` Access all services, resources, and contact options directly on the official ${siteName} website.`;
  }
  descLong = descLong.slice(0, 360);
  if (!/[.!?]$/.test(descLong)) descLong += '.';

  // Extract Keywords
  const extractedKeywords = new Set();
  if (metaKeywords) {
    metaKeywords.split(',').forEach((k) => {
      const clean = k.trim().toLowerCase();
      if (clean.length > 2 && clean.length < 30) extractedKeywords.add(clean);
    });
  }
  // Add fallback keywords from title & hostname
  extractedKeywords.add(siteName.toLowerCase());
  extractedKeywords.add('services');
  extractedKeywords.add('online');
  extractedKeywords.add('resources');
  extractedKeywords.add('business');

  const keywordsArray = Array.from(extractedKeywords).slice(0, 10);

  return {
    site_url: `${parsedUrl.protocol}//${parsedUrl.host}`,
    site_name: siteName,
    titles: [title1, title2, title3],
    descriptions: [descMedium, descShort, descLong],
    keywords: keywordsArray.join(', '),
    category_keywords: keywordsArray.slice(0, 5),
    email: `submissions@${hostname}`,
    password: `Sub!${Math.floor(1000 + Math.random() * 9000)}Link#`,
    max_per_session: 30,
  };
}
