# Mr Ait Directory — Project Map & Enhancement Plan
**Status: planning doc. No further code until approved. (Partial scaffolding already drafted — see §6.)**
**Source material:** `AGENT-BLUEPRINT.md` (build spec from the live campaign) + `CAMPAIGN-REPORT.docx` (Oct 1–2, 2026 joinrcmp.ca run) + `directories.csv` (157 reason-coded domains).

---

## 1. The product in one line

Give it a site + wording kit → it submits the site to hundreds of free human-edited web directories, one at a time, with tiered captcha handling, and logs every outcome to a reason-coded CSV that becomes more valuable every month it's maintained.

The moat is NOT the code. It is (a) the **maintained directory database** (directories rot ~15%/quarter — freshness is the product) and (b) the **field-mapping / failure-mode knowledge** in the blueprint.

---

## 2. Three ways to ship it

| Option | Form | Best for | Effort | Status |
|---|---|---|---|---|
| **A** | Agent skill/prompt pack — SKILL.md + system prompt + the CSV, run by ZCode/Cursor/Gemini with browser control | Fastest to market, zero infra, works today | Days | **Recommended first** |
| **B** | CLI tool — `npx mrait-dir run --kit kit.json` (Node + Playwright + vision fallback) | Fire-and-forget runs, non-technical users, npm reach | 2–4 weeks | Skeleton mostly drafted |
| **C** | MCP server — `submit_batch` / `get_queue` / `get_report` tools | Sticks in every agent's toolbelt, registry distribution | 2–3 weeks | Later |

**Recommended path: A → B → C.** Option A is literally the blueprint §11 system prompt + the CSV — it can be installed into `~/.agents/skills/` today. B reuses everything A proves. C wraps B.

---

## 3. Project map (phases & milestones)

### Phase 0 — Data asset ✅ (done)
- `directories.csv` — 157 domains seeded from the live campaign:
  30 submitted · 80 queued (status `ok`) · 41 culled with reason codes (`dead-*`, `broken-*`, `paid-gated`, `no-form`) · 6 need one human captcha click · special rows (Skaffe weekend window, ActiveSearchResults password, NetInsert meta tag, Daduru NAP).
- Reason-code taxonomy lives in status + notes — this is what makes the tool smart.

### Phase 1 — Agent pack (Option A) — ~1–2 days
1. `agent/SKILL.md` — installable skill: blueprint §11 system prompt, expanded with the fingerprint table (§4), field mapping (§5), captcha tiers (§7), result patterns (§9).
2. `agent/system-prompt.md` — paste-into-any-agent variant.
3. Ship rule: agent processes `status=ok` rows only, saves CSV after every site, announces one line per result, stops on payment/2 consecutive hard failures/session cap.
4. Human-captcha flow: pre-fill form, leave tab open, ask the human, wait for "done", submit.

### Phase 2 — CLI (Option B) — ~2 weeks
- **M1 skeleton (day 1):** CSV loader/saver (atomic) + Playwright engine + phpLD handler + result detection + save-after-every-site.
- **M2 captchas (day 2–3):** image captcha vision loop (CSS `scale(3)` + `image-rendering: pixelated` zoom trick), reCAPTCHA checkbox clicker (cookie-banner removal first, x+25/y+25 anchor click, token-length check), human-in-the-loop prompt, optional 2Captcha adapter (opt-in only).
- **M3 coverage (day 4–5):** wizard handler (1 retry → `broken-wizard`), category-first handler, title rotation on uniqueness errors, honeypots never filled, description-length matching per form maxlength, NAP forms skipped without data.
- **M4 productization (week 2):** `kit.example.json` schema + validation, `verify` / `run` / `report` / `export` / `doctor` commands, monthly re-verification cron, README + honest-use disclaimers, npm package with the cleaned CSV.

### Phase 3 — MCP server (Option C) — ~2–3 weeks
- Tools: `submit_batch(kit, limit)`, `get_queue()`, `get_report()`, `verify_domains(domains[])`.
- Thin wrapper over the Phase-2 engine; state stays in the tracker CSV.
- Publish to MCP registries + the npm package links to it.

### Phase 4 — Distribution & monetization (mrait.ca)
- Free tool page: "AI Directory Submitter" — playbook + cleaned CSV download, email-gated → list building.
- The maintained CSV is a lead magnet by itself (publish ONLY `domain, url, submit_url, category, status, last_checked` — never the working tracker).
- Upsell: managed submissions service for people who won't run agents.

---

## 4. Core architecture (how the pieces fit)

```
kit.json (titles×3, descriptions×3, email, password, keywords, category_keywords)
directories.csv → tracker.csv (working copy, private)
        │
        ▼
   ┌─────────────── ENGINE LOOP (1 site at a time, cap 25/session) ───────────────┐
   │ 1. verify       HTTP GET 10s, https→http retry, parked/suspended/blank       │
   │ 2. discover     homepage <a> /submit|add-url|suggest/ → common-path probes    │
   │ 3. fingerprint  phpLD-classic | wizard-gate | category-first | NAP | login    │
   │ 4. fill         field-regex mapper, honeypots/reciprocal untouched,           │
   │                 description picked per form maxlength                          │
   │ 5. category     option-text scoring: user kws ×3 > ladder ×2 > depth bonus    │
   │ 6. captcha      none → image(vision) → reCAPTCHA click → human-in-loop        │
   │                 → 2captcha(opt-in) → CF walls = blocked-manual                │
   │ 7. submit       correct button (never .last()), PLEASE WAIT ≤30s, _blank tabs │
   │ 8. outcome      success / failure / paid / activation / unknown → title       │
   │                 rotation on "not unique", one retry, then log                 │
   │ 9. SAVE CSV AFTER EVERY SITE + one-line announcement                          │
   └───────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
   session report: submitted / failed / skipped w/ reasons + "waiting on you" list
```

**Non-negotiables (from the campaign):** save after every site · never close a tab holding a filled human-captcha form · free tiers only · never invent NAP data · one submission per directory · human-in-the-loop is the DEFAULT (solving services violate ToS and get domains blacklisted).

---

## 5. Enhancement ideas (ranked — beyond the blueprint)

1. **Acceptance tracker (killer feature).** Re-crawl each directory 30/60 days later, search for the site URL, confirm the listing actually went live. Nobody in this market tracks post-submission acceptance — turns "we submitted to 40 directories" into "we got 26 live backlinks."
2. **Half-submit / human-batch mode.** The exact workflow that won the campaign: pre-fill 10–15 forms in tabs, human clicks all captchas in one sitting, automation fires the submits. One command: `mrait-dir prefill` + `mrait-dir fire`.
3. **Monthly auto re-verification cron.** Directories rot ~15%/quarter — the re-verify job IS the moat. `verify` command + scheduled run keeps status fresh; publish the pruned export monthly.
4. **Evidence capture.** Screenshot after every submission → auto-built PDF campaign report per site/client (the CAMPAIGN-REPORT.docx already proved its worth — automate it). Great for the managed-service upsell.
5. **Inbox watcher.** IMAP/forwarding watch on the kit email → auto-click verification links (SoMuch, SonicRun style) → flips `needs-activation` outcomes automatically.
6. **Kit A/B ledger.** Track which title/description variant was used per directory, correlate with acceptances → data-driven wording.
7. **Category-tree pre-crawler.** For category-first engines, pre-map `submit.php?c=N` per relevant category once, cache it — repeat visits get faster and safer.
8. **Reciprocal-links module.** Generate a small links page on the user's site + auto-fill reciprocal fields for the few directories that demand it (unlock CorpDirectory-type sites).
9. **Multi-site campaigns.** Kit per client, one private tracker with a client column, per-client `report` + `export` (public export always strips client data).
10. **Session-pacing profiles.** Randomized delays, daily caps, browser-profile rotation — because Google starts hard-challenging reCAPTCHAs after ~15–20 solves/day/session (measured).

---

## 6. Current state of the folder (no further work done)

Already drafted (scaffolding, untested, NOT run against any live site):
- `directories.csv` — seed data, complete ✅
- `package.json`, `_seed.py` (seed generator)
- `src/`: csv, kit, fields, category, results, fingerprint, page-form, captcha, submit, discover, verify (core logic modules)
- Missing: `engine.js` (orchestrator), `cli.js` (commands), agent pack, README, tests — **not started, per your call**

Nothing has been installed, executed, or pointed at any directory. Say the word to (a) continue the CLI build, (b) ship Option A (the agent pack) instead, or (c) scrap the scaffolding.

---

## 7. Decisions to make

1. **Ship order:** A (agent pack) first, then B? Or B straight away?
2. **Audience:** internal tool for our own campaigns first, or productized for mrait.ca visitors from day one?
3. **Name:** `mrait-directory` / `mrait-dir` CLI / "Mr Ait Directory Submitter"?
4. **Captcha default:** human-in-the-loop (recommended, ToS-safe) — confirm 2Captcha adapter is wanted at all.
5. **First target CSV source:** the 80 queued from the Oct campaign, or scrape the 3 blueprint sources fresh for a ~437-domain universe?
