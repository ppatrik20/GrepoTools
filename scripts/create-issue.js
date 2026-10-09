#!/usr/bin/env node
/**
 * scripts/create-issue.js
 * CLI helper to generate and create GitHub issues for Ideas, Plans, Bugs, and Implementations.
 *
 * Usage:
 *   node scripts/create-issue.js --type <idea|plan|bug|task> --title "<Title>" [options]
 *
 * Options:
 *   --type        idea | plan | bug | task (required)
 *   --title       Issue title (required)
 *   --area        map | intel | operations | pins | sync | auth | ui | arch | other
 *   --target      ready-for-agent | ready-for-human | needs-triage (for tasks)
 *   --priority    critical | high | normal | low (for bugs)
 *   --parent      Parent issue number, e.g. 42
 *   --blocked-by  Blocking issues, e.g. "None" or "#12, #14"
 *   --dry-run     Print body and gh command without executing
 */

const { execSync, spawnSync } = require('child_process');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.replace(/^--/, '');
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        options[key] = next;
        i++;
      } else {
        options[key] = true;
      }
    }
  }

  return options;
}

function checkGhAuth() {
  try {
    execSync('gh auth status', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function buildIssue(options) {
  const type = (options.type || '').toLowerCase();
  const title = options.title || 'Untitled';
  const area = options.area || 'other';
  const parent = options.parent ? `#${options.parent.replace(/^#/, '')}` : null;
  const blockedBy = options['blocked-by'] || 'None (can start immediately)';
  const target = options.target || 'ready-for-agent';
  const priority = options.priority || 'normal';

  let formattedTitle = title;
  let labels = [];
  let body = '';

  switch (type) {
    case 'idea':
      if (!formattedTitle.startsWith('[Idea]')) formattedTitle = `[Idea] ${formattedTitle}`;
      labels = ['type:idea', 'needs-triage', `area:${area}`];
      body = `### Target Domain / Area\narea:${area}\n\n` +
        `### Problem or Tactical Opportunity\n${options.problem || 'Describe the challenge or user friction...'}\n\n` +
        `### Proposed Concept & Behavior\n${options.concept || options.body || 'Describe the proposed solution or gameplay mechanic...'}\n\n` +
        `### Expected Impact & Value\n${options.value || 'Strategic value for alliance operations...'}\n\n` +
        `### Alternatives & Open Questions\n${options.alternatives || 'None identified yet.'}\n\n` +
        (options.refs ? `### Related References\n${options.refs}\n` : '');
      break;

    case 'plan':
      if (!formattedTitle.startsWith('[Plan]')) formattedTitle = `[Plan] ${formattedTitle}`;
      labels = ['type:plan', 'needs-triage', `area:${area}`];
      body = `### Target Domain / Area\narea:${area}\n\n` +
        `### Objective & Strategic Scope\n${options.objective || options.body || 'High-level goal and scope...'}\n\n` +
        `### Domain Seams & Architectural Alignment\n${options.architecture || 'Aligns with domain ADRs and GLOSSARY.md.'}\n\n` +
        `### Work Breakdown Structure (Tracer Bullets)\n${options.breakdown || '- [ ] Slice 1: Core engine (Blocked by: None)\n- [ ] Slice 2: UI integration (Blocked by: Slice 1)'}\n\n` +
        `### Non-Goals & Out-of-Scope\n${options.non_goals || '- Out of scope items...'}\n\n` +
        `### Dependencies & Risk Analysis\n${options.risks || 'No immediate blockers.'}\n`;
      break;

    case 'bug':
      if (!formattedTitle.startsWith('[Bug]')) formattedTitle = `[Bug] ${formattedTitle}`;
      labels = ['type:bug', 'needs-triage', `area:${area}`, `priority:${priority}`];
      body = `### Affected Domain / Area\narea:${area}\n\n` +
        `### Severity\npriority:${priority}\n\n` +
        `### Description of the Problem\n${options.desc || options.description || options.body || 'Describe what is broken...'}\n\n` +
        `### Steps to Reproduce\n${options.repro || '1. Go to...\n2. Click...\n3. See error'}\n\n` +
        `### Expected vs Actual Behavior\n${options.expected || 'Expected: ...\nActual: ...'}\n\n` +
        `### Environment & World Context\n${options.env || 'World: default | Dev environment'}\n\n` +
        (options.logs ? `### Error Logs / Traces\n\`\`\`\n${options.logs}\n\`\`\`\n` : '');
      break;

    case 'task':
    case 'implementation':
      if (!formattedTitle.startsWith('[Task]')) formattedTitle = `[Task] ${formattedTitle}`;
      labels = ['type:task', target, `area:${area}`];
      body = (parent ? `Part of ${parent}\n\n` : '') +
        `### What to Build (End-to-End Behavior)\n${options.build || options.what_to_build || options.body || 'Describe verifiable behavior...'}\n\n` +
        `### Acceptance Criteria\n${options.criteria || '- [ ] Behavior works as specified\n- [ ] Automated tests passing'}\n\n` +
        `### Blocked by\n${blockedBy}\n\n` +
        `### Execution Target\n${target}\n\n` +
        (options.seams ? `### Technical Seams\n${options.seams}\n\n` : '') +
        (options.verification ? `### Verification\n${options.verification}\n` : '');
      break;

    default:
      console.error(`❌ Unknown issue type: "${type}". Allowed types: idea, plan, bug, task`);
      printHelp();
      process.exit(1);
  }

  return { formattedTitle, labels, body, parent };
}

function printHelp() {
  console.log(`
Usage:
  node scripts/create-issue.js --type <idea|plan|bug|task> --title "<Title>" [options]

Examples:
  # Create an Idea
  node scripts/create-issue.js --type idea --title "Alliance Territory Heatmap" --area map --problem "Hard to see coverage gaps" --concept "Add Voronoi heat overlay"

  # Create an Architectural Plan
  node scripts/create-issue.js --type plan --title "Conquest Radar Overhaul" --area intel --objective "Refactor radar into WebGL shaders"

  # Create a Bug Report
  node scripts/create-issue.js --type bug --title "Transit curve offset at zoom 12" --area operations --priority high --desc "Curve jumps 128px"

  # Create an Implementation Task
  node scripts/create-issue.js --type task --title "Compute Bézier curve coordinates" --area operations --parent 42 --target ready-for-agent --blocked-by None
`);
}

function main() {
  const options = parseArgs();

  if (options.help || !options.type || !options.title) {
    printHelp();
    return;
  }

  const { formattedTitle, labels, body, parent } = buildIssue(options);

  console.log(`\n========================================`);
  console.log(`📝 Title : ${formattedTitle}`);
  console.log(`🏷️  Labels: ${labels.join(', ')}`);
  if (parent) console.log(`🔗 Parent: ${parent}`);
  console.log(`========================================\n`);
  console.log(body);
  console.log(`========================================\n`);

  const hasGh = checkGhAuth();
  const labelFlags = labels.flatMap(l => ['--label', l]);

  if (options['dry-run'] || !hasGh) {
    if (!hasGh) {
      console.warn('⚠️  GitHub CLI (`gh`) is not logged in. Run `gh auth login` to publish automatically.');
    }
    console.log('To create this issue manually or via gh CLI, run:\n');
    console.log(`gh issue create --title "${formattedTitle}" ${labels.map(l => `--label "${l}"`).join(' ')} --body "${body.replace(/"/g, '\\"')}"`);
    return;
  }

  console.log('🚀 Publishing to GitHub Issues via `gh` CLI...\n');
  const ghArgs = ['issue', 'create', '--title', formattedTitle, ...labelFlags, '--body', body];
  if (parent) {
    // If supported by current gh version
    // Otherwise it's already included as "Part of #..." in the body
  }

  const result = spawnSync('gh', ghArgs, { stdio: 'inherit' });
  if (result.status === 0) {
    console.log('\n✨ Issue created successfully on GitHub!');
  } else {
    console.error('\n❌ Failed to create issue via gh CLI.');
    process.exit(result.status || 1);
  }
}

main();
