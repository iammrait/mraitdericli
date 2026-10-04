import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const DIRECTORIES_FILE = path.join(DATA_DIR, 'directories.csv');
const TRACKER_FILE = path.join(DATA_DIR, 'tracker.csv');

/**
 * Parses a simple CSV file into array of row objects
 */
export function parseCSV(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    // Basic CSV splitting taking into account possible quotes
    const rawCols = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    const row = {};
    headers.forEach((h, idx) => {
      let val = rawCols[idx] !== undefined ? rawCols[idx].trim() : '';
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1).replace(/""/g, '"');
      }
      row[h] = val;
    });
    rows.push(row);
  }
  return rows;
}

/**
 * Writes or appends rows to tracker.csv safely
 */
export function recordResult(result) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const fileExists = fs.existsSync(TRACKER_FILE);
  const headers = ['domain', 'url', 'submit_url', 'category', 'type', 'status', 'http_status', 'submitted', 'date', 'notes'];

  if (!fileExists) {
    fs.writeFileSync(TRACKER_FILE, headers.join(',') + '\n', 'utf-8');
  }

  const escapeCSV = (val) => {
    const s = String(val ?? '').replace(/"/g, '""');
    return s.includes(',') || s.includes('\n') || s.includes('"') ? `"${s}"` : s;
  };

  const line = [
    escapeCSV(result.domain || ''),
    escapeCSV(result.url || ''),
    escapeCSV(result.submit_url || ''),
    escapeCSV(result.category || ''),
    escapeCSV(result.type || ''),
    escapeCSV(result.status || ''),
    escapeCSV(result.http_status || '200'),
    escapeCSV(result.submitted || 'no'),
    escapeCSV(result.date || new Date().toISOString().split('T')[0]),
    escapeCSV(result.notes || ''),
  ].join(',') + '\n';

  fs.appendFileSync(TRACKER_FILE, line, 'utf-8');
}

/**
 * Returns list of remaining unsubmitted directories from data/directories.csv
 */
export function getRemainingQueue() {
  const dirs = parseCSV(DIRECTORIES_FILE);
  const tracker = parseCSV(TRACKER_FILE);

  const processedDomains = new Set();
  tracker.forEach((t) => {
    if (t.domain) processedDomains.add(t.domain.toLowerCase());
  });

  return dirs.filter((d) => {
    if (!d.domain) return false;
    const dom = d.domain.toLowerCase();
    // Skip if already in tracker with a reason code or submitted
    return !processedDomains.has(dom);
  });
}

/**
 * Returns overall campaign stats
 */
export function getCampaignStats() {
  const tracker = parseCSV(TRACKER_FILE);
  const totalChecked = tracker.length;
  const submittedCount = tracker.filter((t) => (t.submitted || '').toLowerCase() === 'yes').length;
  const paidGatedCount = tracker.filter((t) => (t.notes || '').includes('PAID-gated')).length;
  const brokenCount = tracker.filter((t) => (t.notes || '').includes('BROKEN') || (t.notes || '').includes('DEAD')).length;
  const captchaHostileCount = tracker.filter((t) => (t.notes || '').includes('CAPTCHA')).length;

  return {
    totalChecked,
    submittedCount,
    paidGatedCount,
    brokenCount,
    captchaHostileCount,
    history: tracker.slice(-50).reverse(),
  };
}
