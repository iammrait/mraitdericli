// CSV load/save for the directory tracker. RFC4180-ish: quoted fields, escaped quotes.
// The tracker file is the product's memory — save after EVERY site (atomic write).

import fs from 'node:fs';
import path from 'node:path';

export const TRACKER_FIELDS = [
  'domain', 'url', 'submit_url', 'category', 'http', 'status',
  'submitted', 'date', 'notes',
];

// Public export columns (blueprint §2): never ship campaign columns.
export const PUBLIC_FIELDS = [
  'domain', 'url', 'submit_url', 'category', 'status', 'last_checked',
];

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, i) => { obj[h] = (r[i] ?? '').trim(); });
    return obj;
  });
}

function escapeField(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function serialize(rows, fields = TRACKER_FIELDS) {
  const lines = [fields.join(',')];
  for (const r of rows) lines.push(fields.map((f) => escapeField(r[f])).join(','));
  return lines.join('\n') + '\n';
}

// Atomic save: write tmp, rename over target. Crash-safe mid-write.
export function saveCSV(filePath, rows, fields = TRACKER_FIELDS) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, serialize(rows, fields), 'utf-8');
  fs.renameSync(tmp, filePath);
}

export function loadCSV(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return parseCSV(fs.readFileSync(filePath, 'utf-8'));
}

// First run: the seed directories.csv becomes the working tracker.csv.
// The tracker accumulates campaign columns; the seed stays clean.
export function ensureTracker(seedPath, trackerPath) {
  if (fs.existsSync(trackerPath)) return loadCSV(trackerPath);
  const seed = loadCSV(seedPath);
  if (!seed.length) throw new Error(`seed CSV not found or empty: ${seedPath}`);
  fs.mkdirSync(path.dirname(path.resolve(trackerPath)), { recursive: true });
  saveCSV(trackerPath, seed);
  return seed;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}
