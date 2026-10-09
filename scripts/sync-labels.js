#!/usr/bin/env node
/**
 * scripts/sync-labels.js
 * Synchronizes labels defined in .github/labels.yml to the GitHub repository using gh CLI.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LABELS_FILE = path.join(__dirname, '..', '.github', 'labels.yml');

function parseLabelsYaml(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const blocks = content.split(/\n(?=-\s+name:)/g);
  const labels = [];

  for (const block of blocks) {
    const nameMatch = block.match(/name:\s*["']?([^"'\n]+)["']?/);
    const colorMatch = block.match(/color:\s*["']?([a-fA-F0-9]{6})["']?/);
    const descMatch = block.match(/description:\s*["']?([^"'\n]+)["']?/);

    if (nameMatch) {
      labels.push({
        name: nameMatch[1].trim(),
        color: colorMatch ? colorMatch[1].trim().toLowerCase() : 'ededed',
        description: descMatch ? descMatch[1].trim() : ''
      });
    }
  }

  return labels;
}

function checkGhAuth() {
  try {
    execSync('gh auth status', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log('🏷️  Checking GitHub labels configuration...\n');

  if (!fs.existsSync(LABELS_FILE)) {
    console.error(`❌ Labels file not found at ${LABELS_FILE}`);
    process.exit(1);
  }

  const labels = parseLabelsYaml(LABELS_FILE);
  console.log(`📋 Found ${labels.length} labels in .github/labels.yml\n`);

  if (!checkGhAuth()) {
    console.warn('⚠️  GitHub CLI (`gh`) is either not installed or not logged in.');
    console.warn('   Run `gh auth login` in your terminal to authenticate.');
    console.warn('   Note: These labels are also automatically synchronized in GitHub Actions via .github/workflows/sync-labels.yml on push.\n');
    console.log('Labels to be synced:');
    labels.forEach(l => {
      console.log(` - [${l.name}] (#${l.color}): ${l.description}`);
    });
    return;
  }

  console.log('🚀 Synchronizing labels with GitHub repository via `gh` CLI...\n');

  let success = 0;
  let failed = 0;

  for (const label of labels) {
    const escapedDesc = label.description.replace(/"/g, '\\"');
    const cmd = `gh label create "${label.name}" --color "${label.color}" --description "${escapedDesc}" --force`;
    try {
      execSync(cmd, { stdio: 'pipe' });
      console.log(` ✅ ${label.name}`);
      success++;
    } catch (err) {
      console.error(` ❌ Failed to sync "${label.name}":`, err.message);
      failed++;
    }
  }

  console.log(`\n🎉 Completed! Synced ${success} labels (${failed} failed).`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
