/**
 * Category scoring engine based on Section 6 of AGENT-BLUEPRINT.md
 */

const GENERIC_LADDER = [
  { regex: /employment|career|jobs|recruitment|work/i, weight: 12 },
  { regex: /education|training|learning|school|academy/i, weight: 9 },
  { regex: /business|services|consulting|commercial/i, weight: 6 },
  { regex: /internet|computers|web|technology|software/i, weight: 4 },
  { regex: /reference|society|government|directory/i, weight: 2 },
];

export function scoreCategoryOption(optionText, userKeywords = []) {
  if (!optionText || typeof optionText !== 'string') return -100;
  const text = optionText.trim();
  if (text.length === 0 || /^(--|select|choose|none)/i.test(text)) return -100;

  let score = 0;

  // 1. User keywords match (weight 5 per keyword match)
  const lowerText = text.toLowerCase();
  for (const kw of userKeywords) {
    if (kw && lowerText.includes(kw.toLowerCase().trim())) {
      score += 15;
    }
  }

  // 2. Generic ladder match
  for (const ladder of GENERIC_LADDER) {
    if (ladder.regex.test(text)) {
      score += ladder.weight;
      break;
    }
  }

  // 3. Depth bonus (prefers subcategories like "| |___" or ">" or "--")
  const depthIndicators = (text.match(/(\||_|>|-{2,})/g) || []).length;
  score += Math.min(depthIndicators * 2, 8);

  return score;
}

export function pickBestCategory(options, userKeywords = []) {
  let bestScore = -999;
  let bestOption = null;

  for (const opt of options) {
    const score = scoreCategoryOption(opt.text, userKeywords);
    if (score > bestScore) {
      bestScore = score;
      bestOption = opt;
    }
  }

  return bestOption;
}
