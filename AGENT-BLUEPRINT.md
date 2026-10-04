# DIRECTORY SUBMITTER — AI Agent Build Blueprint
### Everything learned from a real 437-directory submission campaign
**© 2026 [mrait.ca](https://mrait.ca/) · Mr Ait — all rights reserved.**
**Purpose:** Feed this file to Cursor / Gemini / Claude and it contains 90% of the design decisions, field mappings, failure modes, and working tricks — so the builder skips days of trial and error.

---

## 1. WHAT THE PRODUCT IS

A tool where a user provides:
```json
{
  "site_url": "https://example.com",
  "site_name": "Example",
  "titles": ["Example - Main Title", "Example | Alt Title", "Example #3"],
  "descriptions": ["150-300 char description v1", "variant 2", "variant 3"],
  "email": "submissions@example.com",
  "password": "a-dedicated-password",
  "keywords": "kw1, kw2, kw3",
  "category_keywords": ["education", "career", "employment"],
  "captcha_mode": "human-in-the-loop" | "2captcha-api",
  "captcha_api_key": "optional",
  "max_per_session": 25
}
```
…and the agent submits the site to hundreds of web directories automatically, saving a per-site result log (CSV) the user can track.

**Three ways to ship it (pick one, or all evolve):**
| Option | Form | Best for | Effort |
|---|---|---|---|
| A | **Agent skill/prompt pack** — a markdown playbook + the directory CSV that the user feeds to Claude/Cursor/Gemini which drives a browser (browser-use MCP, Playwright MCP, computer-use) | Fastest to market, zero infra, works TODAY with any agent that has browser control | Days |
| B | **CLI tool** (Node + Playwright + LLM vision fallback) — `npx directory-submitter --config kit.json` | Non-technical users, fire-and-forget | 2-4 weeks |
| C | **MCP server** — exposes `submit_batch` / `get_queue` / `get_report` tools to any MCP client | Distribution via MCP registries, sticks in people's toolbelts | 2-3 weeks |

**Recommendation: start with A** (it is literally this document + the CSV), grow into C. The moat is NOT the code — it's (a) the maintained directory database with per-site status, and (b) the field-mapping/failure knowledge below.

---

## 2. THE DATA ASSET (the actual moat)

Ship a `directories.csv` with columns:
```
domain, url, submit_url, category, http_status, last_checked, submitted, notes
```
- Start from ~437 scraped domains (sources: serpmaestro.com/blog/directory-submission-sites, webnots.com directory list, saaspedia.io list — scrape these 3 and you have the raw universe).
- **Curl-verify all first** (HTTP GET, 10s timeout, retry http if https fails). Expect ~85% alive — but "alive" lies: parked domains return 200. Real status only comes from opening the submit page.
- Maintain a **reason-code taxonomy** in notes — this is what makes the tool smart:
  - `DEAD-parked`, `DEAD-hijacked`, `DEAD-suspended`, `DEAD-forsale`, `DEAD-blank`
  - `BROKEN-wizard` (form never advances), `BROKEN-sql` (server rejects saves), `BROKEN-norm`, `NO-FORM`, `CAPTCHA-hostile`, `PAID-gated`, `NEEDS-NAP`, `OK`
- Re-verify dead ones monthly; directories rot fast (~15% per quarter).

**⚠️ Publish a CLEANED export, never your working tracker.** The public `directories.csv` must contain ONLY: `domain, url, submit_url, category, status, last_checked`. Strip all campaign columns (submitted-by, emails used, per-campaign notes, client/site identifiers) before shipping. Your working tracker is private.

---

## 3. THE PIPELINE (exactly what worked, in order)

```
load queue (skip reason-coded rows) →
for each site:
  1. open submit_url (or discover it: homepage → find <a> matching
     /submit|add[-_]?url|suggest|add[-_]?link/i, prefer category-scoped links)
  2. fingerprint the form (see §4) → route to the right handler
  3. fill fields (field-name mapping table, §5)
  4. pick category (option-text scoring, §6)
  5. solve captcha (tiered strategy, §7)
  6. submit (correct button! see §8) → detect outcome (§9)
  7. handle errors (title rotation, captcha retry, classify, §10)
  8. SAVE PROGRESS TO DISK AFTER EVERY SITE — non-negotiable
  9. never navigate away from a tab with a pending human-captcha form
```

**Pacing:** 1 site at a time, 2-4 min each. Cap per session (25) — Google starts hard-challenging reCAPTCHAs after ~15-20 solves in one browser session/day. Plan human-click batches for the leftovers.

**Realistic yield (measured):** ~25% submit clean end-to-end, ~15% need one human click, ~30% are broken/dead, ~15% paid-gated, ~15% misc (NAP required, slow servers, CF walls). A "successful run" over 100 sites ≈ 28-40 live submissions.

---

## 4. FORM FINGERPRINTING (route to the right handler)

Detect by field names + page structure:

| Engine family | Signature | Handler |
|---|---|---|
| **phpLD classic** | inputs named `TITLE, URL, DESCRIPTION, OWNER_NAME, OWNER_EMAIL, CATEGORY_ID(select), CAPTCHA` or `g-recaptcha-response`, checkbox `AGREERULES/agree` | Direct fill (most common, ~60% of sites) |
| **phpLD wizard-gate** | form has only hidden `CATEGORY_ID` + button id `ok` / value "Go To Step Two/Three" | Multi-step: select category → click gate → choose LINK_TYPE radio → step 3 form appears at `submit.php?c=N&LINK_TYPE=x`. WARNING: many of these wizards are simply broken (step 2 never loads) — 1 retry then mark `BROKEN-wizard` |
| **Category-first** | submit link carries category via referer/session (`submit.php?c=N`) | Must navigate INTO the category page first, then click its Submit link — direct nav to submit.php loses the category |
| **Modern WP/custom** | arbitrary field names (`ayroo-listing-title` etc.) | LLM form-understanding fallback OR the generic name-mapper (§5) |
| **Business-NAP style** | requires address/city/phone/hours/lat-lon | Skip unless user supplied NAP data (never invent it) |
| **Requiring login** | registration before submit | Optional: register with provided email+password, handle email-activation (needs inbox access) |

---

## 5. FIELD NAME MAPPING (the accumulated lookup table)

Match by regex on input `name`/`id`, case-insensitive, first hit wins:

```
title:       ^title$ | site_title | linkname | listing.*title | edt.*title
url:         ^url$ | site_url | linkurl | website_url | listing.*url   (careful: exclude "recip")
description: ^description$ | site_desc | descriere | listing.*desc
owner_name:  owner_name | your_name | sname | cname(=company) | contact.*name
email:       owner_email | ^email$ | email_add | your-email
keywords:    meta_keywords | ^keywords$
meta_desc:   meta_description
agree:       agree | agreerules | acceptterms | tos   (checkbox — always check)
honeypot:    website_confirm | stopbrowserautofill | fields labeled "leave empty" → MUST STAY EMPTY
reciprocal:  recip_url | recpr_url → LEAVE EMPTY unless user opted in
password:    password1/password2 or password (only when the form asks; use dedicated pw)
```

**Radio/select traps learned the hard way:**
- Link-type radios often have NO labels in the DOM (`value="2"/"4"` with empty label text). Prefer reading the VISIBLE label text next to each radio; choose the one containing "free" or "regular" — **"normal" is frequently the PAID tier** (e.g. "Fast Reviews $3" vs "Regular Reviews free"). If labels are empty and prices unknown, choose the LAST radio (usually free) then verify the result page for payment demands; if a `payment.php` redirect appears → mark `PAID-gated`, restart with the other radio if any.
- Category selects: pick by option-text scoring (§6), and watch for multi-level (`catlevelid[0]`, `catlevelid[1]` cascading).

---

## 6. CATEGORY SELECTION (scoring)

```
score(option_text) = matches of user category_keywords (weight 3)
                   + matches of generic ladder (weight 2):
                     employment|career|jobs > education|training > reference|society|government
                   + depth bonus: prefer the DEEPEST matching option (paths like "| |___Job and Employment Resources")
if no match in current select → try parent/top-level (Education, Reference, Society, Business)
if select is category-first (hidden CATEGORY_ID=0) → go browse the category page and submit from there
```
Never submit uncategorized if a fitting category exists — editors reject those.

---

## 7. CAPTCHA STRATEGY (tiered — this is the heart)

| Tier | Trigger | Action |
|---|---|---|
| 1. **None** | no captcha field on form | Just submit. (Happens more than you'd think.) |
| 2. **Static image captcha** | `<img src=…/captcha.php…>` + text input | Screenshot the img at **CSS transform: scale(3), image-rendering: pixelated** (massive readability win on noisy backgrounds), send to vision model, type answer. If "invalid code" → the image regenerated; re-read ONCE, then human fallback. Math captchas ("1 + 8 = ?") → compute. |
| 3. **reCAPTCHA v2 checkbox** | `iframe[title="reCAPTCHA"]` | Click the checkbox at anchor-iframe (x+25, y+25). Token check: `document.querySelector('[name="g-recaptcha-response"]').value.length > 100`. Retry click once with fresh coordinates. **Remove cookie-consent banners first** ("Got it!" overlays swallow clicks — delete their DOM node via JS). |
| 4. **Interactive challenge** | image-grid puzzle appears / token stays 0 after 2 clicks | Mode A (default, recommended): **human-in-the-loop** — keep the tab open (closing tabs loses all filled form state!), notify user "solve captcha in tab X, reply done", then submit. Mode B (user opted in): send `g-recaptcha-response` job to 2Captcha/anti-captcha API with user's key, poll for token (30-60s). Note: solving services violate most directories' ToS and get domains blacklisted — make Mode A the default and say so. |
| 5. **Cloudflare Turnstile / CF walls** | `cf-turnstile-response` present, or CF strips POST data entirely | Turnstile often auto-solves (token present on load). If POSTs arrive empty server-side despite filled fields (all fields "missing" in response) → Cloudflare is stripping the automated request; **unfixable** → mark `BLOCKED-manual`, give the user a 30-second manual instruction. |
| 6. **Honeypot detection** | fields labeled "leave empty" / offscreen inputs | Leave empty. Fill = instant silent reject. |

**Session pacing:** Google scores the browser session. After ~15-20 solves, challenge rate → near 100%. Human clicks still pass. So the tool should: auto-solve image captchas freely, auto-click checkboxes early in a session, and switch to human-batch mode when challenge rate spikes.

---

## 8. SUBMITTING (boring but critical)

- phpLD: click `input[name="submit"]`/value "Continue" — **NOT** other submit buttons (search "GO", "preview", "reset"). Enumerate `form[action*=submit] input[type=submit]` and pick by name/value regex `submit|continue`, never `.last()` blindly.
- Some forms disable the button until captcha is valid; re-check `disabled` before clicking.
- Buttons that turn into "PLEASE WAIT" mean the server is processing (slow dirs take 30s+) — poll for navigation/message up to 30s before declaring timeout.
- If the form uses JS gates, clicking via page-side `el.click()` (evaluate) sometimes works when the automation layer's click times out.
- **target="_blank" forms** open result in a new tab — enumerate tabs after submit and read the result there.

---

## 9. RESULT DETECTION (success vs failure vs unknown)

Success patterns (any hit):
```
"submitted and awaiting approval" | "thank you for your link submission" | "submission received"
"link submitted" | "site submitted successfully" | "CAPTCHA was completed successfully" (only if form disappeared!)
"has been added" | confirmation URL: /submit-result|/thank|/landing|/confirm
```
Failure patterns:
```
"error occured" | "invalid code" | "incorrect" | "not unique" | "already been submitted"
"you must agree" | "payment" (→ PAID-gated) | "account suspended" | "508" | blank body (len=0)
```
Ambiguity rule: form still present + no message + no error → assume NOT submitted; retry submit once; still nothing → log `UNKNOWN`. Some sites show zero feedback (e.g. silent queueing) — mark "submitted, unconfirmed".
Special cases: "Title is not unique in the parent category" → rotate to title variant 2 and resubmit (fresh captcha). "Email Confirmation REQUIRED" → the tool must offer inbox monitoring or flag for user.

---

## 10. ERROR-HANDLING PLAYBOOK (per-site lessons — worth real money)

1. **Save progress after EVERY site.** Crash/timeout recovery must resume from the CSV, not re-do work.
2. **Never close a tab with a filled form awaiting human captcha** — the fill is lost.
3. Title rotation on uniqueness errors; keep 3 variants in the kit.
4. Some sites require **min description length** (200 chars) — validate kit descriptions against per-form `maxlength`/stated minimums; keep a long + medium + short variant.
5. Some require **email matching the site domain** (`name@domain.com`) — warn the user in the kit, not mid-run.
6. Reciprocal-URL fields: empty by default; a few directories demand it — batch them for "user with a links page".
7. NAP (phone/address/hours) forms: never invent. Either the user provides NAP or the site is skipped.
8. Expect these server bugs in the wild (real examples): MySQL columns too short for IPv6 IPs, required enum columns receiving '' because the form lacks the radio, handlers returning blank pages, redirect loops, "Account Suspended" hosts. All → classify + skip, do NOT retry more than twice.
9. Log EVERYTHING to the CSV: `domain,url,submit_url,status(category),http,submitted,date,notes` — notes carry the reason code. This file is the product's memory.
10. Be polite: 1 submission per directory per site, no retries across days for "awaiting approval" ones, respect free tiers only.

---

## 11. SYSTEM PROMPT (for Option A — paste into any browser-capable agent)

```
You are DirectorySubmitter, an SEO assistant. You submit {site_url} to free web directories.

KIT: {titles[], descriptions[], email, password, keywords, category_keywords}
QUEUE: directories.csv — process rows where submitted=no and notes has no reason-code.
RULES:
- Free tiers only. If any payment page appears: stop, mark PAID-gated, next site.
- Never invent data: no fake names, phones, addresses, or credentials.
- Pick the most relevant category by keyword scoring; prefer deeper subcategories.
- One submission per directory. Rotate title/description variants across sites.
- Fill honeypot fields with NOTHING.
- Save the CSV after every single site. Announce each result in one line.
- Captchas: solve image captchas via screenshot+vision (zoom 3x first). Click reCAPTCHA
  checkboxes (iframe x+25,y+25 after removing cookie banners). If an interactive puzzle
  appears: leave the tab open, ask me to solve it, wait for my "done", then submit.
- After every 10 sites, summarize: submitted / failed / skipped with reasons.
- Stop conditions: payment demand, 2 consecutive hard failures, session cap reached.
```

---

## 12. BUILD PLAN FOR CURSOR/GEMINI (suggested milestones)

**M1 — Skeleton (day 1):** CSV loader + Playwright engine + phpLD handler + result detection + CSV writer. Test on the ~30 highest-confidence sites in the CSV first (the ones with status OK / no reason-code).
**M2 — Captchas (day 2-3):** image-captcha vision loop (zoom trick), reCAPTCHA checkbox clicker, human-in-the-loop mode (tab + notification + wait), optional 2Captcha adapter.
**M3 — Coverage (day 4-5):** wizard handler, category-first handler, title rotation, honeypots, meta-field variants, NAP forms (skip w/o data).
**M4 — Product (week 2):** config JSON schema, progress webview/terminal table, dead-link re-verification cron, README + safety disclaimers. Ship as npm package + the CSV.
**M5 — Agent distribution (week 3):** wrap as MCP server (`submit_batch`, `get_status`, `regen_queue`) + publish the playbook version for Claude/Cursor users.

**Tech notes for the builder:**
- Playwright > puppeteer for the form work; keep a persistent browser profile (some dirs remember sessions).
- Vision calls needed only for captchas + unknown forms — a run of 25 sites costs pennies in LLM tokens.
- Run headless=false or headed mode: several anti-bot layers behave differently headless.
- Windows quirk: `python3` alias doesn't exist — use `python`; never assume LibreOffice or other non-default tooling is installed.
- Timezone/window: keep viewport ≥1280×720; some forms hide fields at small sizes.

---

## 13. DISTRIBUTION IDEAS (for mrait.ca)

- Free tool page: "AI Directory Submitter — feed your kit to your AI agent" with the playbook + CSV download (email-gated = list building).
- The CSV itself (maintained monthly, dead ones pruned) is a lead magnet by itself.
- npm package `directory-submitter` + MCP server listing = organic reach into the agent ecosystem.
- Upsell path: managed submissions service for people who won't run agents.

## 14. HONEST-USE NOTES (put these in the product)
- Directories are human-edited; the tool submits, editors approve. Quality of the USER'S site determines acceptance.
- Solving captchas via third-party APIs violates those directories' terms — default to human-in-the-loop.
- One submission per directory per site; re-submitting duplicates gets domains blacklisted.
- Don't submit to categories that don't fit; editors delete mismatches.

---

**© 2026 [mrait.ca](https://mrait.ca/) · Mr Ait. All rights reserved.**
Built from live-campaign operational knowledge: 437 directories fingerprinted, every failure mode catalogued.
If you build something with this, a link back to mrait.ca is appreciated.
