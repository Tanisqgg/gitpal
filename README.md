# GitPal

A VS Code extension that lets you describe Git actions in plain English. GitPal interprets what you want to do, inspects your repository state, and gives you either a ready-to-run command plan or a beginner-friendly explanation — without ever generating dangerous commands.

## Features

**Ask questions about your repo**
> "What branch am I on?" · "Which files are staged?" · "Do I have conflicts?" · "Am I ahead or behind origin?"

GitPal reads your actual `git status` and answers in plain English. No commands are generated for read-only questions.

**Request Git actions**
> "Push this code to the main branch" · "Create a branch called frontend and push my code" · "Push only globals.css to the frontend branch"

GitPal builds a step-by-step command plan (`git switch`, `git add`, `git commit`, `git push`) using your real changed files. File-specific requests use the exact matched path — never `git add .`.

**Handles ambiguity safely**
> "Help me add globals.css to the frontend branch" · "Save my work"

When a request could mean more than one Git workflow, GitPal shows a clarification card with clickable option buttons instead of guessing.

**File picker for duplicate basenames**
If you ask to push `globals.css` but two changed files share that name, GitPal shows both full paths as buttons. Clicking one generates a plan for that exact file.

**Safety guardrails**
- Destructive commands (`reset --hard`, `push --force`, `clean -fd`, `rebase -i`) are never generated.
- "Run in Terminal" only appears on commands GitPal has explicitly marked safe (`git status`, `git add <specific-file>`).
- Once a new plan is generated, buttons from the previous plan are gone and cannot be re-run.

## Install

1. Download the latest `.vsix` file from [GitHub Releases](https://github.com/Tanisqgg/gitpal/releases)
2. Open VS Code
3. Go to Extensions
4. Click `...`
5. Choose `Install from VSIX...`
6. Select the downloaded file

## How to open GitPal

1. Open a Git repo folder in VS Code
2. Press `Ctrl+Shift+P`
3. Run `GitPal: Open`

## Usage

1. Open the GitPal panel from the activity bar (the GitPal icon).
2. Type what you want to do in plain English and press Enter.
3. Read the result card:
   - **Green border** — answer card. Shows what GitPal found in your repo plus "Try next" suggestion pills.
   - **Blue border** — plan card. Shows the commands GitPal would run, with "Run in Terminal" buttons on safe steps.
   - **Yellow border** — clarification card. Shows option buttons or a file picker to help GitPal understand your intent.
4. Click any pill, option button, or file picker entry to pre-fill the input and generate a follow-up plan.

## Requirements

- VS Code 1.116 or later
- A Git repository open in your workspace (GitPal works without one but will note that it cannot inspect the repo)

## Running Tests

```
npm test
```

Runs the automated unit test suite covering intent parsing, plan building, file matching, safety guardrails, and next-step suggestions. See [TESTING.md](TESTING.md) for the full test matrix and manual QA checklist.

## Extension Settings

GitPal adds no configuration settings. Everything is automatic based on your workspace's Git state.

## Known Issues

- Webview rendering, button click round-trips, and the LLM fallback path have no automated test coverage. See [TESTING.md](TESTING.md) for details.
- Windows paths with spaces or non-ASCII characters in file names are not fully tested.

## Release Notes

### 0.0.1

First public preview of GitPal, a beginner-friendly plain-English Git assistant for VS Code.

- Helps users understand their repo state
- Answers Git questions in plain English
- Generates safe Git workflow plans
- Avoids risky guesses with clarification flows
