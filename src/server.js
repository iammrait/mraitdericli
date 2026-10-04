import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import open from 'open';
import { extractSiteMetadata } from './scraper/metaExtractor.js';
import { SubmitterEngine } from './engine/submitter.js';
import { getRemainingQueue, getCampaignStats, parseCSV } from './storage/tracker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const TRACKER_FILE = path.join(DATA_DIR, 'tracker.csv');
const DIRECTORIES_FILE = path.join(DATA_DIR, 'directories.csv');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// State Management
let engine = null;
let isRunning = false;
let currentProgress = {
  isRunning: false,
  currentDomain: null,
  currentIndex: 0,
  total: 0,
  logs: [],
  captchaPrompt: null,
};

// 1. Auto-extract metadata from target website
app.post('/api/extract-metadata', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    const metadata = await extractSiteMetadata(url);
    res.json(metadata);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Get directory queue status
app.get('/api/queue', (req, res) => {
  try {
    const allDirs = parseCSV(DIRECTORIES_FILE);
    const remaining = getRemainingQueue();
    const stats = getCampaignStats();

    const instantCount = allDirs.filter((d) => d.type === 'instant').length;
    const establishedCount = allDirs.filter((d) => d.type === 'established').length;

    res.json({
      totalDirectories: allDirs.length,
      instantCount,
      establishedCount,
      remainingCount: remaining.length,
      stats,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Start Submission Session
app.post('/api/start', async (req, res) => {
  if (isRunning) {
    return res.status(400).json({ error: 'A submission session is already running' });
  }

  const { kit, maxSites = 30, filterType = 'all' } = req.body;
  if (!kit || !kit.site_url) {
    return res.status(400).json({ error: 'Valid submission kit is required' });
  }

  let queue = getRemainingQueue();
  if (filterType === 'instant') {
    queue = queue.filter((d) => d.type === 'instant');
  } else if (filterType === 'established') {
    queue = queue.filter((d) => d.type === 'established');
  }

  if (queue.length === 0) {
    return res.status(400).json({ error: 'No directories remaining in queue!' });
  }

  isRunning = true;
  currentProgress = {
    isRunning: true,
    currentDomain: null,
    currentIndex: 0,
    total: Math.min(queue.length, maxSites),
    logs: [],
    captchaPrompt: null,
  };

  engine = new SubmitterEngine({
    onProgress: (evt) => {
      if (evt.type === 'site_start') {
        currentProgress.currentIndex = evt.index;
        currentProgress.currentDomain = evt.domain;
        currentProgress.logs.unshift({
          time: new Date().toLocaleTimeString(),
          domain: evt.domain,
          message: `Opening ${evt.domain} (${evt.index}/${evt.total})...`,
          status: 'RUNNING',
        });
      } else if (evt.type === 'site_end') {
        currentProgress.captchaPrompt = null;
        currentProgress.logs[0] = {
          time: new Date().toLocaleTimeString(),
          domain: evt.domain,
          message: `${evt.domain}: ${evt.outcome.notes}`,
          status: evt.outcome.status,
          submitted: evt.outcome.submitted === 'yes',
        };
      }
    },
    onCaptchaRequired: (evt) => {
      currentProgress.captchaPrompt = evt;
      currentProgress.logs.unshift({
        time: new Date().toLocaleTimeString(),
        domain: evt.domain,
        message: `⚠️ Captcha click needed for ${evt.domain}`,
        status: 'CAPTCHA_WAITING',
      });
    },
  });

  // Run in background asynchronously
  (async () => {
    try {
      await engine.runBatch(queue, kit, { maxSites, headed: true });
    } catch (err) {
      console.error('Session error:', err);
    } finally {
      isRunning = false;
      currentProgress.isRunning = false;
      currentProgress.captchaPrompt = null;
      if (engine) await engine.close();
      engine = null;
    }
  })();

  res.json({ message: 'Submission session started', count: queue.length });
});

// 4. Get Current Status & Logs
app.get('/api/status', (req, res) => {
  const stats = getCampaignStats();
  res.json({
    ...currentProgress,
    stats,
  });
});

// 5. User signals captcha completed
app.post('/api/captcha-done', (req, res) => {
  if (engine && currentProgress.captchaPrompt) {
    engine.signalCaptchaDone();
    currentProgress.captchaPrompt = null;
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'No active captcha prompt' });
  }
});

// 6. User skips current site
app.post('/api/skip-site', (req, res) => {
  if (engine && currentProgress.captchaPrompt) {
    if (engine.pendingCaptchaResolver) {
      engine.pendingCaptchaResolver(false);
      engine.pendingCaptchaResolver = null;
    }
    currentProgress.captchaPrompt = null;
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'No active captcha prompt to skip' });
  }
});

// 7. Stop Session
app.post('/api/stop', async (req, res) => {
  if (engine) {
    engine.abort();
    await engine.close();
    engine = null;
  }
  isRunning = false;
  currentProgress.isRunning = false;
  currentProgress.captchaPrompt = null;
  res.json({ success: true });
});

// 8. Download Tracker CSV
app.get('/api/download-tracker', (req, res) => {
  if (fs.existsSync(TRACKER_FILE)) {
    res.download(TRACKER_FILE, 'directory-submission-results.csv');
  } else {
    res.status(404).send('No submission results recorded yet.');
  }
});

app.listen(PORT, async () => {
  console.log(`\n======================================================`);
  console.log(`  🚀 Directory Submitter running at: http://localhost:${PORT}`);
  console.log(`  🌐 Website: https://mrait.ca/`);
  console.log(`  💬 Support: https://mrait.ca/go/discord`);
  console.log(`======================================================\n`);

  // Auto-open browser on local startup
  if (process.env.NODE_ENV !== 'production' && !process.env.NO_AUTO_OPEN) {
    try {
      await open(`http://localhost:${PORT}`);
    } catch (_) {}
  }
});
