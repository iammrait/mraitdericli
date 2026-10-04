// Pre-verification (blueprint §2): curl-verify every domain before wasting
// browser time. "Alive" lies — parked domains return 200 — so classify what
// the body says. Real status still only comes from opening the submit page.

import { fetchHTML } from './discover.js';

const PARKED = [/go\s?daddy.*parked/i, /this domain is (for sale|parked)/i, /buy this domain/i, /sedoparking/i, /afternic/i, /domain (is )?for sale/i, /related searches.*sponsor/i, /domain parking/i];
const SUSPENDED = [/account suspended/i, /site temporarily unavailable.*host/i, /this hosting account/i];
const HIJACKED = [/casino|gambling|viagra|porn|betting/i];

export async function verifyDomain(row) {
  const out = { http: '', status: row.status, notes: row.notes, submitted: row.submitted, date: new Date().toISOString().slice(0, 10) };
  let res;
  try {
    res = await fetchHTML(row.url || `https://${row.domain}/`, 10000);
  } catch {
    // https sometimes fails where http works — retry once
    try {
      res = await fetchHTML(`http://${row.domain}/`, 10000);
    } catch {
      out.http = 'ERR';
      out.status = 'dead-unreachable';
      out.notes = `${row.notes} | unreachable at verify ${out.date}`.replace(/^ \| /, '');
      return out;
    }
  }
  out.http = String(res.status);
  const body = (res.html || '').slice(0, 20000);

  if (res.status >= 500) {
    out.status = 'retry-later';
    out.notes = `${row.notes} | HTTP ${res.status} at verify ${out.date}`.replace(/^ \| /, '');
    return out;
  }
  if (PARKED.some((re) => re.test(body))) {
    out.status = 'dead-parked';
  } else if (SUSPENDED.some((re) => re.test(body))) {
    out.status = 'dead-suspended';
  } else if (body.trim().length < 200 && !/<form/i.test(body)) {
    out.status = 'dead-blank';
  } else if (res.status === 404 || res.status === 403) {
    out.status = 'dead-unreachable';
  } else {
    out.status = 'ok';
  }
  if (out.status !== 'ok' && HIJACKED.some((re) => re.test(body)) && !/hijack/i.test(row.notes)) {
    out.status = 'dead-hijacked';
  } else if (out.status !== 'ok' && HIJACKED.some((re) => re.test(body))) {
    out.notes = `${out.notes} | possible hijack (spam keywords)`;
  }
  out.notes = out.notes.replace(/^ \| /, '');
  return out;
}

// Rows eligible for the submission queue.
export function isQueueable(row) {
  return row.status === 'ok' && row.submitted !== 'yes' && row.domain;
}

// Rows the verify command will touch (skip reason-coded dead ones unless --all).
export function isVerifiable(row, all = false) {
  if (!row.domain) return false;
  if (all) return row.submitted !== 'yes';
  return row.status === 'ok' || row.status === 'retry-later' || row.status === 'unknown' || row.status === '';
}
