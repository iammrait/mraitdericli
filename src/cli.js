#!/usr/bin/env node

import readline from 'node:readline';
import { extractSiteMetadata } from './scraper/metaExtractor.js';
import { SubmitterEngine } from './engine/submitter.js';
import { getRemainingQueue, getCampaignStats } from './storage/tracker.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) options.url = args[++i];
    if (args[i] === '--email' && args[i + 1]) options.email = args[++i];
    if (args[i] === '--max' && args[i + 1]) options.max = parseInt(args[++i], 10);
    if (args[i] === '--filter' && args[i + 1]) options.filter = args[++i];
    if (args[i] === '--headless') options.headless = true;
    if (args[i] === '--server') options.server = true;
  }
  return options;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

async function main() {
  const options = parseArgs();

  if (options.server) {
    await import('./server.js');
    return;
  }

  console.log(`\n======================================================`);
  console.log(`  ⚡ Directory Submitter CLI · by Mr Ait`);
  console.log(`  🌐 Website: https://mrait.ca/`);
  console.log(`  💬 Support: https://mrait.ca/go/discord`);
  console.log(`======================================================\n`);

  let targetUrl = options.url;
  if (!targetUrl) {
    targetUrl = await ask('🌐 Enter your website URL (e.g. https://mywebsite.com): ');
  }
  if (!targetUrl) {
    console.error('Error: Website URL is required.');
    process.exit(1);
  }

  let email = options.email;
  if (!email) {
    email = await ask('📧 Enter your submissions contact email: ');
  }
  if (!email) {
    console.error('Error: Email is required.');
    process.exit(1);
  }

  console.log(`\n🪄 Analyzing ${targetUrl} and crafting submission kit...`);
  const kit = await extractSiteMetadata(targetUrl);
  kit.email = email;

  console.log(`\n✅ Generated Submission Profile:`);
  console.log(`   Site Name:    ${kit.site_name}`);
  console.log(`   Title (Main): ${kit.titles[0]}`);
  console.log(`   Keywords:     ${kit.keywords}`);
  console.log(`   Description:  ${kit.descriptions[0].slice(0, 100)}...`);

  let queue = getRemainingQueue();
  if (options.filter === 'instant') {
    queue = queue.filter((d) => d.type === 'instant');
  } else if (options.filter === 'established') {
    queue = queue.filter((d) => d.type === 'established');
  }

  const maxSites = options.max || kit.max_per_session || 25;
  console.log(`\n📋 Found ${queue.length} directories in queue. Submitting up to ${maxSites} sites.`);

  const proceed = await ask('\nReady to start? (Y/n): ');
  if (proceed && proceed.toLowerCase().startsWith('n')) {
    console.log('Submission cancelled.');
    process.exit(0);
  }

  console.log('\n🚀 Launching browser automation...');
  const engine = new SubmitterEngine({
    onProgress: (evt) => {
      if (evt.type === 'site_start') {
        console.log(`\n[${evt.index}/${evt.total}] Opening ${evt.domain}...`);
      } else if (evt.type === 'site_end') {
        const mark = evt.outcome.submitted === 'yes' ? '✅' : '⚠️';
        console.log(`  ${mark} Outcome: ${evt.outcome.status} (${evt.outcome.notes})`);
      }
    },
    onCaptchaRequired: async (evt) => {
      console.log(`\n⚠️  CAPTCHA REQUIRED on ${evt.domain}!`);
      console.log(`   Please solve the captcha in the open browser window.`);
      await ask('   Press [ENTER] when done to continue (or type "skip"): ');
      engine.signalCaptchaDone();
    },
  });

  try {
    await engine.runBatch(queue, kit, {
      maxSites,
      headed: !options.headless,
    });
  } catch (err) {
    console.error('Session error:', err);
  } finally {
    await engine.close();
    rl.close();
  }

  const stats = getCampaignStats();
  console.log(`\n======================================================`);
  console.log(`  🎉 Session Complete!`);
  console.log(`  Total Checked: ${stats.totalChecked} | Submitted: ${stats.submittedCount}`);
  console.log(`  Full results saved to data/tracker.csv`);
  console.log(`======================================================\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
