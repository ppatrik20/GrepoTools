# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations, or use the project helper scripts in `scripts/`.

## 4-Tier Issue Architecture

The tracker manages the complete project lifecycle across 4 distinct issue types:

1. **💡 Idea (`type:idea`)**: Early concepts, gameplay mechanic suggestions, UX improvements, and proposals.
2. **🗺️ Plan (`type:plan`)**: Epics, architectural designs, roadmap initiatives, and ADR-aligned plans. Holds checklists of implementation sub-issues.
3. **🐛 Bug / Issue (`type:bug`)**: Defects, regressions, sync errors, and broken calculations.
4. **⚡ Implementation / Task (`type:task`)**: Concrete, verifiable tracer-bullet vertical slices ready for implementation by an agent (`ready-for-agent`) or human (`ready-for-human`).

---

## Conventions & CLI Operations

- **Create an issue**:
  - Via helper script: `node scripts/create-issue.js --type <idea|plan|bug|task> --title "..." [options]`
  - Via `gh`: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Make an issue a sub-issue of a parent**: `gh issue create --parent <parent> ...`, or `gh issue edit <parent> --add-sub-issue <child>` afterwards (`gh` 2.94+). Older `gh`: `gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>` (database id, as in **Blocking** below). Without sub-issues, put `Part of #<parent>` at the top of the child body.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`
- **Sync repo labels**: `npm run labels:sync` (reads `.github/labels.yml`).

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

---

## GitHub Forms & Automation

### 1. Issue Form Templates (`.github/ISSUE_TEMPLATE/`)
When opening issues via the GitHub web UI, structured interactive forms are presented:
- `01_idea.yml`: Problem, proposed concept, expected impact, alternatives, references.
- `02_plan.yml`: Objective, domain seams & ADRs, work breakdown checklist, non-goals, risk assessment.
- `03_bug.yml`: Affected area, severity, steps to reproduce, expected vs actual, environment, logs.
- `04_implementation.yml`: Parent plan reference, what to build, acceptance criteria, blocked-by, execution target.

### 2. Automated Triage Workflow (`.github/workflows/issue-triage.yml`)
Runs on issue creation and updates:
- **Auto-labeling**: Infers type (`type:idea`, `type:plan`, `type:bug`, `type:task`), domain (`area:*`), and priority (`priority:*`) from template inputs and title tags.
- **State initialization**: Assigns `needs-triage` by default unless marked `ready-for-agent` / `ready-for-human`.
- **Assignment transition**: Automatically removes `needs-triage` when an assignee is added.
- **Information loopback**: When the reporter comments on an issue with `needs-info`, the issue automatically transitions back to `needs-triage`.
- **Closure handling**: Issues closed as "not planned" automatically receive `wontfix`.

### 3. Comment Slash Commands / ChatOps (`.github/workflows/issue-commands.yml`)
Maintainers and agents can manage issue states directly via comments:
- `/triage` — Resets state to `needs-triage`.
- `/ready` or `/ready-agent` — Applies `ready-for-agent`, removes `needs-triage` and `needs-info`.
- `/ready-human` — Applies `ready-for-human`, removes `needs-triage` and `needs-info`.
- `/needs-info` — Applies `needs-info`, removes other triage states.
- `/claim` — Assigns the issue to the commenter.
- `/unclaim` — Removes commenter from assignees.
- `/wontfix` — Applies `wontfix` and closes the issue as not planned.
- `/priority <critical|high|normal|low>` — Sets the priority tier.
- `/area <name>` — Applies `area:<name>`.

---

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`.
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

---

## When a skill says "publish to the issue tracker"

Create a GitHub issue using `gh issue create` or `node scripts/create-issue.js`.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above.

---

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (see **Make an issue a sub-issue of a parent**). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only, the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
