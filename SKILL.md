---
name: directory-submitter
description: Automated SEO directory backlink submission agent using battle-tested operational rules, form fingerprinting, category matching, and human-in-the-loop captcha flow.
---

# Directory Submitter Agent Skill

Use this skill to submit any website to verified free web directories to build early foundational citations and backlinks.

## Operational Decision Rules (from mrait.ca Blueprint)
1. **Free Tiers Only**: Never enter credit card info. If a directory demands payment, mark `PAID-gated` and skip.
2. **Rotating Titles**: Rotate across 3 title variants to prevent "Title not unique" directory errors.
3. **Tiered Descriptions**: Rotate short (130 chars), medium (220+ chars for minimum length rules), and long descriptions.
4. **Honeypot Protection**: Strictly keep fields labeled "leave empty", `confirm`, or `stopbrowserautofill` empty.
5. **Human-in-the-Loop Captchas**:
   - Math captchas are automatically computed.
   - reCAPTCHA checkboxes are auto-clicked.
   - If an interactive puzzle appears, leave the tab open, notify the user, wait for completion, then submit.
6. **Per-Site Persistence**: Every outcome is recorded immediately into `data/tracker.csv`.

## Running the Tool
- **Web UI mode** (recommended for friends and non-tech users):
  ```bash
  npm start
  ```
  Opens `http://localhost:3000`. User provides their site URL and email, clicks "Auto-Detect Info", then "Start Automated Submissions".
- **CLI mode**:
  ```bash
  node src/cli.js --url https://example.com --email info@example.com --max 25
  ```
