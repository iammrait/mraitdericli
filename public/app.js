// Directory Submitter Frontend Controller

let statusPollingInterval = null;
let currentKit = null;

// DOM Elements
const inputSiteUrl = document.getElementById('input-site-url');
const inputEmail = document.getElementById('input-email');
const btnAutoDetect = document.getElementById('btn-auto-detect');
const detectSpinner = document.getElementById('detect-spinner');

const inputSiteName = document.getElementById('input-site-name');
const inputKeywords = document.getElementById('input-keywords');
const inputTitle1 = document.getElementById('input-title-1');
const inputTitle2 = document.getElementById('input-title-2');
const inputTitle3 = document.getElementById('input-title-3');
const inputDescMed = document.getElementById('input-desc-med');
const inputDescShort = document.getElementById('input-desc-short');
const inputDescLong = document.getElementById('input-desc-long');

const selectQueueFilter = document.getElementById('select-queue-filter');
const inputMaxSites = document.getElementById('input-max-sites');
const btnStartRun = document.getElementById('btn-start-run');
const btnStopRun = document.getElementById('btn-stop-run');
const btnDownloadCsv = document.getElementById('btn-download-csv');
const queueStatusBadge = document.getElementById('queue-status-badge');

const currentTargetText = document.getElementById('current-target-text');
const progressPercentageText = document.getElementById('progress-percentage-text');
const progressFill = document.getElementById('progress-fill');
const statSubmitted = document.getElementById('stat-submitted');
const statPending = document.getElementById('stat-pending');
const statSkipped = document.getElementById('stat-skipped');
const logStream = document.getElementById('log-stream');

const captchaModal = document.getElementById('captcha-modal');
const captchaModalMsg = document.getElementById('captcha-modal-msg');
const captchaDomainDisplay = document.getElementById('captcha-domain-display');
const btnCaptchaDone = document.getElementById('btn-captcha-done');
const btnCaptchaSkip = document.getElementById('btn-captcha-skip');
const btnCopyCode = document.getElementById('btn-copy-code');
const reciprocalCodeSnippet = document.getElementById('reciprocal-code-snippet');

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
  fetchQueueStatus();
  startStatusPolling();
});

// 1. Fetch Queue Status
async function fetchQueueStatus() {
  try {
    const res = await fetch('/api/queue');
    const data = await res.json();
    queueStatusBadge.innerText = `${data.remainingCount} Directories Ready (${data.instantCount} Instant)`;
    if (data.stats) {
      statSubmitted.innerText = data.stats.submittedCount || 0;
      statPending.innerText = data.stats.totalChecked || 0;
      statSkipped.innerText = (data.stats.paidGatedCount || 0) + (data.stats.brokenCount || 0);
    }
  } catch (err) {
    queueStatusBadge.innerText = 'Queue Loaded';
  }
}

// 2. Play subtle notification sound for Captcha
function playAlertChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (_) {}
}

// 3. Auto-Detect Site Information
btnAutoDetect.addEventListener('click', async () => {
  const url = inputSiteUrl.value.trim();
  if (!url) {
    alert('Please enter your website URL first (e.g. https://mywebsite.com)');
    inputSiteUrl.focus();
    return;
  }

  detectSpinner.classList.remove('hidden');
  btnAutoDetect.disabled = true;

  try {
    const res = await fetch('/api/extract-metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to extract metadata');
    }

    const data = await res.json();
    currentKit = data;

    // Fill inputs
    inputSiteName.value = data.site_name || '';
    if (!inputEmail.value && data.email) {
      inputEmail.value = data.email;
    }
    inputKeywords.value = data.keywords || '';
    inputTitle1.value = data.titles[0] || '';
    inputTitle2.value = data.titles[1] || '';
    inputTitle3.value = data.titles[2] || '';

    inputDescMed.value = data.descriptions[0] || '';
    inputDescShort.value = data.descriptions[1] || '';
    inputDescLong.value = data.descriptions[2] || '';

    // Update reciprocal code snippet for convenience
    reciprocalCodeSnippet.innerText = `<a href="https://mrait.ca" target="_blank" rel="noopener">Featured on Directory</a>`;
  } catch (err) {
    alert(`Auto-detect note: ${err.message}. You can manually fill in the fields below.`);
  } finally {
    detectSpinner.classList.add('hidden');
    btnAutoDetect.disabled = false;
  }
});

// 4. Start Run
btnStartRun.addEventListener('click', async () => {
  const siteUrl = inputSiteUrl.value.trim();
  const email = inputEmail.value.trim();

  if (!siteUrl || !email) {
    alert('Please provide your Website URL and Contact Email.');
    return;
  }

  const kit = {
    site_url: siteUrl,
    site_name: inputSiteName.value.trim() || 'My Website',
    email: email,
    keywords: inputKeywords.value.trim(),
    category_keywords: (inputKeywords.value || '').split(',').map((s) => s.trim()).filter(Boolean),
    titles: [
      inputTitle1.value.trim() || inputSiteName.value.trim(),
      inputTitle2.value.trim() || inputSiteName.value.trim(),
      inputTitle3.value.trim() || inputSiteName.value.trim(),
    ].filter(Boolean),
    descriptions: [
      inputDescMed.value.trim(),
      inputDescShort.value.trim(),
      inputDescLong.value.trim(),
    ].filter(Boolean),
    max_per_session: parseInt(inputMaxSites.value, 10) || 25,
  };

  btnStartRun.disabled = true;
  btnStartRun.innerText = 'Submissions in Progress...';
  btnStopRun.classList.remove('hidden');

  try {
    const res = await fetch('/api/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kit,
        maxSites: kit.max_per_session,
        filterType: selectQueueFilter.value,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to start session');
  } catch (err) {
    alert(`Could not start: ${err.message}`);
    btnStartRun.disabled = false;
    btnStartRun.innerText = '🚀 Start Automated Submissions';
    btnStopRun.classList.add('hidden');
  }
});

// 5. Polling Status
function startStatusPolling() {
  if (statusPollingInterval) clearInterval(statusPollingInterval);

  statusPollingInterval = setInterval(async () => {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();

      if (data.isRunning) {
        btnStartRun.disabled = true;
        btnStartRun.innerText = 'Submissions in Progress...';
        btnStopRun.classList.remove('hidden');

        // Progress bar
        const total = data.total || 1;
        const current = data.currentIndex || 0;
        const pct = Math.min(Math.round((current / total) * 100), 100);
        progressFill.style.width = `${pct}%`;
        progressPercentageText.innerText = `${pct}%`;
        currentTargetText.innerText = data.currentDomain
          ? `Submitting to: ${data.currentDomain} (${current}/${total})`
          : `Processing queue... (${current}/${total})`;

        // Captcha Alert
        if (data.captchaPrompt) {
          if (captchaModal.classList.contains('hidden')) {
            playAlertChime();
          }
          captchaModal.classList.remove('hidden');
          captchaDomainDisplay.innerText = data.captchaPrompt.domain || 'Directory';
          captchaModalMsg.innerText =
            data.captchaPrompt.message ||
            'Interactive captcha detected. Please solve the captcha in the open browser window, then click Continue.';
        } else {
          captchaModal.classList.add('hidden');
        }
      } else {
        btnStartRun.disabled = false;
        btnStartRun.innerText = '🚀 Start Automated Submissions';
        btnStopRun.classList.add('hidden');
        captchaModal.classList.add('hidden');

        if (data.total > 0 && data.currentIndex >= data.total) {
          currentTargetText.innerText = `✅ Session Completed! (${data.total} sites processed)`;
          progressFill.style.width = '100%';
          progressPercentageText.innerText = '100%';
        }
      }

      // Stats
      if (data.stats) {
        statSubmitted.innerText = data.stats.submittedCount || 0;
        statPending.innerText = data.stats.totalChecked || 0;
        statSkipped.innerText = (data.stats.paidGatedCount || 0) + (data.stats.brokenCount || 0);
      }

      // Activity Logs
      if (data.logs && data.logs.length > 0) {
        logStream.innerHTML = data.logs
          .map((log) => {
            return `<div class="log-entry ${log.status || ''}">
              <span class="log-time">[${log.time || ''}]</span>
              <span class="log-msg">${log.message || ''}</span>
            </div>`;
          })
          .join('');
      }
    } catch (_) {}
  }, 1500);
}

// 6. User signals Captcha Done
btnCaptchaDone.addEventListener('click', async () => {
  try {
    await fetch('/api/captcha-done', { method: 'POST' });
    captchaModal.classList.add('hidden');
  } catch (_) {}
});

// 7. User skips site
btnCaptchaSkip.addEventListener('click', async () => {
  try {
    await fetch('/api/skip-site', { method: 'POST' });
    captchaModal.classList.add('hidden');
  } catch (_) {}
});

// 8. Stop Session
btnStopRun.addEventListener('click', async () => {
  if (confirm('Stop the current submission run?')) {
    try {
      await fetch('/api/stop', { method: 'POST' });
    } catch (_) {}
  }
});

// 9. Download CSV
btnDownloadCsv.addEventListener('click', () => {
  window.location.href = '/api/download-tracker';
});

// 10. Copy HTML Code
btnCopyCode.addEventListener('click', () => {
  navigator.clipboard.writeText(reciprocalCodeSnippet.innerText);
  btnCopyCode.innerText = 'Copied!';
  setTimeout(() => {
    btnCopyCode.innerText = 'Copy HTML';
  }, 2000);
});
