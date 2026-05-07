# GitPal Testing Plan

## Strategy

Focus automated tests on pure TypeScript logic first:

- `intentParser.ts`: fast rule-based classification for high-confidence prompts.
- `intentClassifier.ts`: local LLM fallback boundary that accepts structured JSON only.
- `repoInspector.ts`: pure parsing of `git status --porcelain=v1 --branch`.
- `commandPlanner.ts`: answer cards, plan cards, clarification cards, file matching, and safety metadata.

Use VS Code/webview manual QA for rendering and terminal button behavior because the current UI is embedded HTML inside a `WebviewViewProvider` without a browser test harness.

## Test Matrix

| Category | Automated | Manual |
| --- | --- | --- |
| Query requests | Intent parsing, answer card kind, no commands, safe risk | Visual answer-card sections |
| Action requests | Push plans, branch switching, file-specific staging, missing/multiple file warnings | Copy buttons and terminal buttons |
| Ambiguous requests | Clarification card, no commands | Wording and layout clarity |
| File matching | Exact basename, missing file, duplicate basename | Full path and partial path prompts in real repos |
| Repo-state edges | Porcelain parse for staged/unstaged/untracked/deleted/conflicted/ahead/behind | Detached HEAD, no origin, real conflict state |
| Safety guardrails | No destructive generated commands, unsafe commands not marked safe | Run buttons appear only for safe commands |
| Beginner UX | Key warnings/assumptions present | Tone, clarity, and visual scanability |

## Manual QA Checklist

Run these in the Extension Development Host with a real Git repo open.

### Answer Cards

- `what branch am I on`
- `am I ahead or behind origin`
- `which files are staged`
- `what has changed`
- `what files are untracked`
- `what files are deleted`
- `do I have conflicts`
- `is my repo clean`

Expected:

- Card type reads as an answer-card layout.
- No command plan is shown by default.
- Sections include `What I found`, relevant file categories, and `Suggested next steps`.

### Plan Cards

- `push this code to the main branch`
- `create a branch called frontend and push my code`
- `push only globals.css to frontend branch`

Expected:

- Card type reads as a plan-card layout.
- Commands come from the planner, not model text.
- File-specific prompt uses `git add <matched-file>`, not `git add .`.
- Command explanations are visible.
- Unsafe commands do not show `Run in Terminal`.

### Clarification Cards

- `help me add globals.css to frontend branch`
- `save my work`
- `update my branch`
- `put this on github`
- `fix my repo`
- `undo my changes`

Expected:

- No commands generated unless intent is high confidence.
- Clarification question is beginner-friendly and specific.

### Safety Checks

Confirm no plan contains:

- `git reset --hard`
- `git push --force`
- `git clean -fd`
- `git rebase -i`

Confirm `Run in Terminal` appears only for planner-marked safe commands such as `git status` and specific-file `git add`.

## Remaining Untested Risk Areas

- Webview DOM rendering is not automated yet.
- Terminal execution button behavior is guarded in extension-host code but not tested with a mocked VS Code API.
- Full end-to-end Git repo states such as detached HEAD and active merge conflicts should be tested manually or with temporary fixture repositories in a future integration suite.
- Some requested action phrases, such as `stash my changes`, `restore globals.css`, and `commit only package.json`, are not fully implemented yet; they should get planner tests when the actions are added.
