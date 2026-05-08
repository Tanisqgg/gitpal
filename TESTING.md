# GitPal Testing Plan

## Strategy

Automated tests cover all pure TypeScript logic:

- `intentParser.ts` — fast rule-based classification
- `intentClassifier.ts` — LLM fallback boundary (structured JSON only)
- `repoInspector.ts` — pure parsing of `git status --porcelain=v1`
- `commandPlanner.ts` — answer cards, plan cards, clarification cards, file matching, clarification options, file picker, next-step suggestions, safety metadata

Webview rendering and terminal button behavior are manual QA only. The webview is embedded HTML without a browser test harness.

## Test Matrix

| Category | Automated | Manual |
| --- | --- | --- |
| Query requests | Intent parsing, answer card kind, no commands, correct sections, next-step strings | Visual section layout, clickable suggestion pills |
| Action requests | Push plans, branch switching, file-specific staging, missing/multiple file warnings | Copy buttons, terminal run buttons |
| Ambiguous requests | Clarification card, no commands, clarificationOptions populated | Button rendering, wording clarity |
| File matching | Exact basename, missing file, duplicate basename, filePicker populated, follow-up queries | Clicking a file picker button, re-run behavior |
| Repo-state edges | Porcelain parse, detached HEAD findings, no-upstream findings, clean repo, non-git repo | Real detached HEAD, real merge conflict |
| Safety guardrails | No destructive commands generated, only safe commands marked safeToRun, follow-up queries safe | Run buttons appear only for marked-safe commands, stale plan cannot be re-run |
| Beginner wording | Key summary strings verified | Tone and clarity review |
| Next-step suggestions | Correct phrases returned per query type | Pill buttons appear, clicking re-runs |
| Follow-up query round-trips | Clarification/picker follow-up queries parse back to valid intents | End-to-end click → new card |

---

## Manual QA Checklist

Run these in the Extension Development Host (`F5`). Open any folder with a Git repo that has at least one changed file and one branch.

---

### A. Query / Repo-State Questions

For each input, verify:
- Card border is **green** (answer card)
- No command plan section is shown
- "What I found" section is present
- "Try next" section shows clickable pill buttons
- Clicking a pill pre-fills the input and generates a new card

| Input | Expected card | Expected "Try next" pills |
| --- | --- | --- |
| `what branch am I on` | answer | Show what changed, Push to this branch, Switch to another branch |
| `am I ahead or behind origin` | answer | Show what changed, Push to this branch |
| `which files are staged` | answer | Commit staged files, Unstage a file, Show changed files |
| `what has changed` | answer | Stage a file, Commit staged files, Show untracked files, Switch branch |
| `what files are untracked` | answer | Stage a file, Show changed files, Commit staged files |
| `what files are deleted` | answer | Stage a file, Commit staged files, Show changed files |
| `do I have conflicts` | answer | Show staged files, Commit staged files, Show changed files |
| `is my repo clean` | answer | Show git status (only one, since no changed files) |

---

### B. Action / Plan Requests

For each input, verify:
- Card border is **blue** (plan card)
- Commands are from the planner, not model-generated text
- File-specific requests use `git add <matched-file>`, never `git add .`
- Unsafe commands (commit, push) do **not** show "Run in Terminal"
- Safe commands (git add specific file) **do** show "Run in Terminal"

| Input | Expected commands | File staging |
| --- | --- | --- |
| `push this code to the main branch` | git switch, git add ., git commit, git push | all files |
| `create a branch called frontend and push my code` | git switch -c, git add ., git commit, git push -u | all files |
| `push only globals.css to frontend branch` (1 match) | git switch, git add src/.../globals.css, git commit, git push | exact file only |
| `push only globals.css to frontend branch` (2 matches) | — (clarification) | file picker shown |

---

### C. Ambiguous / Clarification Requests

For each input, verify:
- Card border is **yellow** (clarification card)
- No commands are generated
- "What would you like to do?" section shows clickable **option buttons**
- Clicking an option pre-fills the input and generates a new plan card

| Input | Expected behavior | Expected buttons |
| --- | --- | --- |
| `help me add globals.css to frontend branch` | clarification card | Stage only globals.css / Commit and push globals.css to frontend / Show matching changed files first |
| `save my work` | clarification card | No buttons (unknown); suggestions shown in Assumptions |
| `update my branch` | clarification card | No buttons |
| `put this on github` | clarification card | No buttons |
| `fix my repo` | clarification card | No buttons |
| `undo my changes` | clarification card | No buttons |

---

### D. Changed-File Picker

Setup: have two files with the same basename changed in your repo (e.g. `src/app/globals.css` and `styles/globals.css`).

| Input | Expected behavior |
| --- | --- |
| `push only globals.css to frontend branch` | Clarification card with **two file path buttons** |
| Click `src/app/globals.css` button | New plan card: `git add src/app/globals.css` |
| Click `styles/globals.css` button | New plan card: `git add styles/globals.css` |

Verify: after picking a file, the input textarea shows the synthesized follow-up query.

---

### E. Repo-State Edge Cases

| Scenario | How to trigger | Expected behavior |
| --- | --- | --- |
| Not in a Git repo | Open a plain folder | Warnings section mentions Git repository not found |
| Detached HEAD | `git checkout <commit-sha>` | Branch findings mention "detached HEAD state" |
| No upstream branch | New local branch with no push | Branch findings say "No upstream branch was detected" |
| Clean repo | No changed files | Answer card, next steps show only "Show git status" |
| Only untracked files | New file, never staged | Untracked section populated; suggestions include "Stage a file" |
| Branch does not exist locally | Request push to unknown branch | Warning that branch was not found; plan still generated safely |

---

### F. Interactive Behavior Round-Trips

| Action | Expected result |
| --- | --- |
| Click a "Try next" pill on an answer card | Textarea fills with pill text; new card generates |
| Click a clarification option button | Textarea fills with follow-up query; new plan card generates |
| Click a file picker button | Textarea fills with specific-file query; plan uses exact path |
| Submit the same ambiguous phrase again | Should still show clarification, not loop into a worse state |
| Rapid re-submit | Only the latest plan's safe commands can be run; old plan commands are cleared |

---

### G. Safety Checks

Confirm **no generated plan ever contains**:
- `git reset --hard`
- `git push --force`
- `git clean -fd`
- `git rebase -i`

Confirm "Run in Terminal" appears **only** for:
- `git status`
- `git add <specific-file>` (not `git add .`)

Confirm **old plan commands cannot be re-run** after a new plan is generated: submit one plan, submit a second plan, then try clicking a button from the first plan's result — it should produce no terminal action (the button is gone since the DOM is replaced).

---

## Biggest Remaining Untested Risks

| Risk | Why it matters | Suggested mitigation |
| --- | --- | --- |
| Webview DOM rendering | `clarificationOptions`, `filePicker`, and `suggestedNextSteps` are rendered in embedded HTML — zero automated coverage | Add a headless webview test or Playwright/Puppeteer harness for the Extension Development Host |
| Button click → postMessage → handler round-trip | The `clarificationChoice`, `filePickerChoice`, `next-step` flows depend on webview JS sending the right `generatePlan` message | Mock the VS Code webview API and simulate message passing in a unit test |
| Stale safe-command set | `lastSafeCommands` is reset on each `generatePlan` message; if a user somehow sends a `runCommand` referencing an old command, it is blocked — but this is not tested with a mocked VS Code API | Add a provider unit test using a fake `webview.postMessage` stub |
| Intent classifier LLM fallback path | The local LLM fallback is tested for structured JSON normalization and rejection, but not for prompt injection in the JSON payload | Add a test for crafted malicious LLM JSON payloads |
| Long file paths with special characters | `quotePath` handles basic ASCII paths; Windows paths with spaces or non-ASCII characters are not tested | Add unit tests for `quotePath` and `escapeCommitMessage` with edge-case inputs |
| Git porcelain format variants | Only a single porcelain fixture is tested; `git status` output varies with merge state, rebase state, stash markers, etc. | Add fixture tests for active merge, rebase in-progress, and stash-with-conflicts output |
