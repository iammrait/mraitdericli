# ⚡ Directory Submitter — AI Backlink Agent & CLI
### Automated SEO Directory Submitter with Auto-Site Detection & Human-in-the-Loop Captchas
**Official Project by [Mr Ait (mrait.ca)](https://mrait.ca/)**  
[![Discord Support](https://img.shields.io/badge/Discord-Support%20Community-5865F2?logo=discord&logoColor=white)](https://mrait.ca/go/discord)
[![Website](https://img.shields.io/badge/Website-mrait.ca-3b82f6)](https://mrait.ca/)

Turnkey tool for submitting websites to curated, high-trust free web directories to build foundational SEO backlinks and citations.

- 🌐 **Official Website:** [https://mrait.ca/](https://mrait.ca/)
- 💬 **Discord Support Community:** [https://mrait.ca/go/discord](https://mrait.ca/go/discord)

Built for **both non-technical users (friends, clients, community)** and **developers / AI agents**.

---

## 🌟 Why Friends & Non-Tech Users Love This

Non-tech users don't need to write code or configure complex JSON files:

1. **🪄 Instant Auto-Detection**: They just type their Website URL (e.g. `https://mybakery.ca`) and their Email. The tool automatically visits their website, pulls their brand name, crafts 3 rotating titles, generates 3 tiered descriptions (satisfying tricky 200+ character minimums), and extracts category tags.
2. **🖥️ Clean Web Dashboard**: Runs locally or on a VPS at `http://localhost:3000` with an intuitive interface.
3. **🔔 Friendly Captcha Alert**: When a directory asks for an interactive reCAPTCHA image puzzle, the dashboard chimes and presents an alert: *"Please click the captcha box in the browser window, then click Continue"*.
4. **💡 Reciprocal Link Helper**: Displays ready-to-copy HTML code for users who have a "Links" or "Partners" page on their site.
5. **📊 Live Results & CSV Export**: Real-time progress bar and a 1-click **Download Results CSV** button to view every submission, timestamp, and directory status.

---

## 🚀 Quick Start (Local)

### For Windows:
Simply double-click **`run.bat`**.
- It installs required packages automatically if running for the first time.
- It launches the server and automatically opens your browser to `http://localhost:3000`.

### For Mac / Linux:
Open a terminal in the folder and run:
```bash
chmod +x run.sh
./run.sh
```

---

## 🛠️ CLI Mode (For Terminal & Advanced Users)

You can also run directly from the command line:

```bash
# Interactive mode (prompts for URL and email)
npm run cli

# One-liner with parameters
node src/cli.js --url https://mywebsite.com --email hello@mywebsite.com --max 25 --filter instant
```

Options:
- `--url <url>`: Target website to submit
- `--email <email>`: Submissions email
- `--max <n>`: Number of directories to submit in this run (default: 25)
- `--filter <type>`: `instant` (32 instant approval sites) | `established` (96 established sites) | `all`
- `--headless`: Run browser without opening visible window

---

## 🌐 Deploy to VPS / Cloud Server

You can host this on your VPS (Ubuntu, Debian, DigitalOcean, Hetzner, etc.) so your friends can access it anytime via web browser!

### Option A: Using Docker (Recommended)
```bash
git clone https://github.com/iammrait/mraitdericli.git
cd mraitdericli
docker compose up -d --build
```
Your submitter dashboard will be live at `http://YOUR_SERVER_IP:3000`!

### Option B: Using PM2 / Node.js
```bash
git clone https://github.com/iammrait/mraitdericli.git
cd mraitdericli
npm install
npx playwright install chromium
npm install -g pm2
pm2 start src/server.js --name directory-submitter
```

---

## 🤖 Using as an AI Agent Skill (Cursor, Antigravity, Claude Code)

This repo includes a full [SKILL.md](file:///C:/Users/mrmon/mrait.ca/mraitdericli/SKILL.md) and [AGENT-BLUEPRINT.md](file:///C:/Users/mrmon/mrait.ca/mraitdericli/AGENT-BLUEPRINT.md).

To have an AI agent run submissions autonomously:
```bash
# In Cursor / Antigravity / Claude Code:
"Use the directory-submitter skill to submit https://mysite.com using hello@mysite.com"
```

---

## 📁 Project Structure

```
mraitdericli/
├── run.bat                  # 1-click Windows runner
├── run.sh                   # 1-click Mac/Linux runner
├── package.json             # Node.js dependencies
├── Dockerfile               # Production Docker container
├── docker-compose.yml       # 1-command VPS deployment
├── AGENT-BLUEPRINT.md       # Complete 437-directory campaign knowledge base
├── SKILL.md                 # Agent skill definition
├── data/
│   ├── directories.csv      # Seed directory universe (instant & established)
│   └── tracker.csv          # Persistent results log (updated after every site)
├── public/                  # Modern Web Dashboard
│   ├── index.html           # Intuitive UI
│   ├── style.css            # Dark mode responsive theme
│   └── app.js               # Auto-detect & real-time monitoring
└── src/
    ├── server.js            # Express API & local web server
    ├── cli.js               # Command-line interface runner
    ├── scraper/
    │   └── metaExtractor.js # Auto-extracts titles, descriptions & keywords
    ├── engine/
    │   ├── submitter.js     # Playwright automation & HITL captcha flow
    │   └── categoryScorer.js# Intelligent category selection algorithm
    └── storage/
        └── tracker.js       # Live CSV state manager
```

---

## 📄 License & Support
© 2026 [Mr Ait (mrait.ca)](https://mrait.ca) · All rights reserved.  
Need help or want to join other web builders? Join our **[Discord Support Community](https://mrait.ca/go/discord)**.
