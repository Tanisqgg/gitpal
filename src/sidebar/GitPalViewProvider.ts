import * as vscode from 'vscode';
import { classifyIntent } from '../core/intentClassifier';
import { buildPlan } from '../core/commandPlanner';
import { inspectRepo } from '../core/repoInspector';

export class GitPalViewProvider implements vscode.WebviewViewProvider {
	constructor(private readonly extensionUri: vscode.Uri) {}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	) {
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.extensionUri]
		};

		webviewView.webview.html = this.getHtml();
		let lastSafeCommands = new Set<string>();

		webviewView.webview.onDidReceiveMessage(async (message) => {
			if (message.type === 'generatePlan') {
				const userText = String(message.value || '').trim();
				const intent = await classifyIntent(userText);
				const repo = await inspectRepo();
				const plan = buildPlan(intent, repo);
				lastSafeCommands = new Set(
					plan.commands
						.filter((command) => command.safeToRun)
						.map((command) => command.command)
				);

				webviewView.webview.postMessage({
					type: 'planResult',
					value: plan
				});
			}

			if (message.type === 'runCommand') {
				const command = String(message.value || '');

				if (!lastSafeCommands.has(command)) {
					vscode.window.showWarningMessage('GitPal only runs commands it marked safe in the latest plan.');
					return;
				}

				const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
				const terminal = vscode.window.createTerminal({
					name: 'GitPal',
					cwd: workspaceFolder?.uri.fsPath
				});

				terminal.show();
				terminal.sendText(command);
			}
		});
	}

	private getHtml(): string {
		return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<style>
					body {
						font-family: var(--vscode-font-family);
						color: var(--vscode-foreground);
						padding: 12px;
					}
					h2 {
						margin: 0 0 6px 0;
						font-size: 20px;
					}
					.sub {
						margin-top: 0;
						margin-bottom: 14px;
						opacity: 0.8;
						font-size: 13px;
					}
					textarea {
						width: 100%;
						min-height: 90px;
						margin-bottom: 10px;
						padding: 10px;
						box-sizing: border-box;
						background: var(--vscode-input-background);
						color: var(--vscode-input-foreground);
						border: 1px solid var(--vscode-input-border);
						border-radius: 8px;
						resize: vertical;
					}
					button {
						width: 100%;
						padding: 10px;
						cursor: pointer;
						border: none;
						border-radius: 8px;
						background: var(--vscode-button-background);
						color: var(--vscode-button-foreground);
						font-weight: 600;
					}
					button:hover {
						background: var(--vscode-button-hoverBackground);
					}
					.small-button {
						width: auto;
						padding: 6px 8px;
						font-size: 12px;
						font-weight: 600;
					}
					.secondary-button {
						background: var(--vscode-button-secondaryBackground);
						color: var(--vscode-button-secondaryForeground);
					}
					.secondary-button:hover {
						background: var(--vscode-button-secondaryHoverBackground);
					}
					.output {
						margin-top: 16px;
					}
					.result-card {
						margin-top: 16px;
						padding: 12px;
						border: 1px solid var(--vscode-panel-border);
						border-radius: 8px;
						background: var(--vscode-sideBar-background);
					}
					.result-card.answer {
						border-left: 3px solid var(--vscode-charts-green);
					}
					.result-card.plan {
						border-left: 3px solid var(--vscode-button-background);
					}
					.result-card.clarification {
						border-left: 3px solid var(--vscode-editorWarning-foreground);
					}
					pre {
						white-space: pre-wrap;
						padding: 10px;
						border-radius: 8px;
						margin-top: 12px;
						background: var(--vscode-textCodeBlock-background);
						overflow-x: auto;
					}
					.badge {
						display: inline-block;
						padding: 4px 8px;
						border-radius: 999px;
						margin-top: 8px;
						font-size: 12px;
						font-weight: 600;
					}
					.badge.safe {
						background: #2d6a4f;
						color: white;
					}
					.badge.caution {
						background: #b08900;
						color: white;
					}
					.badge.dangerous {
						background: #a61e4d;
						color: white;
					}
					p {
						line-height: 1.45;
					}
					ul {
						padding-left: 18px;
					}
					.section {
						margin-top: 16px;
					}
					.section-title {
						margin: 0 0 6px 0;
						font-size: 13px;
						font-weight: 700;
						text-transform: uppercase;
						letter-spacing: 0;
						opacity: 0.8;
					}
					.command-list {
						display: flex;
						flex-direction: column;
						gap: 10px;
					}
					.command-item {
						padding: 10px;
						border: 1px solid var(--vscode-panel-border);
						border-radius: 8px;
					}
					code {
						display: block;
						padding: 8px;
						border-radius: 6px;
						background: var(--vscode-textCodeBlock-background);
						white-space: pre-wrap;
						overflow-wrap: anywhere;
					}
					.command-item p {
						margin: 8px 0 0 0;
					}
					.command-actions {
						display: flex;
						gap: 8px;
						flex-wrap: wrap;
						margin-top: 8px;
					}
					.status-line {
						margin-top: 10px;
						font-size: 12px;
						opacity: 0.8;
					}
					.clarification {
						border-left: 3px solid var(--vscode-editorWarning-foreground);
						padding-left: 10px;
					}
					.warning {
						color: var(--vscode-editorWarning-foreground);
					}
					.hint {
						opacity: 0.75;
						font-size: 12px;
						margin-top: 10px;
					}
					.option-list {
						display: flex;
						flex-direction: column;
						gap: 8px;
						margin-top: 6px;
					}
					.option-button {
						width: 100%;
						padding: 8px 12px;
						text-align: left;
						cursor: pointer;
						border: 1px solid var(--vscode-button-background);
						border-radius: 8px;
						background: transparent;
						color: var(--vscode-foreground);
						font-weight: 500;
						font-size: 13px;
					}
					.option-button:hover {
						background: var(--vscode-button-background);
						color: var(--vscode-button-foreground);
					}
					.suggestion-list {
						display: flex;
						flex-direction: row;
						flex-wrap: wrap;
						gap: 8px;
						margin-top: 6px;
					}
				</style>
			</head>
			<body>
				<h2>GitPal</h2>
				<p class="sub">Plain-English Git help for beginners.</p>

				<textarea id="prompt" placeholder="Example: push this code to the main branch"></textarea>
				<button id="generate">Generate Plan</button>
				<p class="hint">Examples: "show git status", "push this code to the main branch", "create a branch called frontend and push my code"</p>

				<div id="output" class="output"></div>

				<script>
					const vscode = acquireVsCodeApi();

					const promptEl = document.getElementById('prompt');
					const outputEl = document.getElementById('output');
					const generateBtn = document.getElementById('generate');
					let currentPlan;

					generateBtn.addEventListener('click', () => {
						const value = promptEl.value;
						vscode.postMessage({
							type: 'generatePlan',
							value
						});
					});

					outputEl.addEventListener('click', async (event) => {
						const button = event.target.closest('button[data-action]');

						if (!button || !currentPlan) {
							return;
						}

						const action = button.dataset.action;
						const index = Number(button.dataset.index);

						if (action === 'copy-all') {
							await copyText(currentPlan.commands.map((command) => command.command).join('\\n'));
							showStatus('Copied all commands.');
							return;
						}

						if (action === 'clarification-option' || action === 'file-pick' || action === 'next-step') {
							const query = button.dataset.query;
							promptEl.value = query;
							vscode.postMessage({ type: 'generatePlan', value: query });
							return;
						}

						const command = currentPlan.commands[index];

						if (!command) {
							return;
						}

						if (action === 'copy-command') {
							await copyText(command.command);
							showStatus('Copied command.');
							return;
						}

						if (action === 'run-command' && command.safeToRun) {
							vscode.postMessage({
								type: 'runCommand',
								value: command.command
							});
							showStatus('Sent safe command to the terminal.');
						}
					});

					async function copyText(value) {
						await navigator.clipboard.writeText(value);
					}

					function showStatus(value) {
						const statusEl = document.getElementById('status-line');

						if (statusEl) {
							statusEl.textContent = value;
						}
					}

					window.addEventListener('message', (event) => {
						const message = event.data;

						if (message.type === 'planResult') {
							const plan = message.value;
							currentPlan = plan;

							const escapeHtml = (value) =>
								String(value)
									.replace(/&/g, '&amp;')
									.replace(/</g, '&lt;')
									.replace(/>/g, '&gt;')
									.replace(/"/g, '&quot;')
									.replace(/'/g, '&#039;');

							const renderList = (items, className = '') => {
								if (!items?.length) {
									return '';
								}

								return \`<ul class="\${className}">\${items
									.map((item) => \`<li>\${escapeHtml(item)}</li>\`)
									.join('')}</ul>\`;
							};

							const renderSection = (title, body) => {
								if (!body) {
									return '';
								}

								return \`
									<div class="section">
										<p class="section-title">\${title}</p>
										\${body}
									</div>
								\`;
							};

							const renderRepoAnswerSection = (title, items) => {
								if (!plan.repoAnswer || items === undefined) {
									return '';
								}

								const body = items.length ? renderList(items) : '<p>None.</p>';
								return renderSection(title, body);
							};

							const renderClarificationOptions = (options) => {
								if (!options?.length) return '';
								const buttons = options.map((opt) =>
									\`<button class="option-button" data-action="clarification-option" data-query="\${escapeHtml(opt.followUpQuery)}">\${escapeHtml(opt.label)}</button>\`
								).join('');
								return renderSection('What would you like to do?', \`<div class="option-list">\${buttons}</div>\`);
							};

							const renderFilePicker = (picker) => {
								if (!picker?.files?.length) return '';
								const buttons = picker.files.map((f) =>
									\`<button class="option-button" data-action="file-pick" data-query="\${escapeHtml(f.followUpQuery)}">\${escapeHtml(f.path)}</button>\`
								).join('');
								return renderSection(escapeHtml(picker.prompt), \`<div class="option-list">\${buttons}</div>\`);
							};

							const renderNextSteps = (steps) => {
								if (!steps?.length) return '';
								const buttons = steps.map((step) =>
									\`<button class="small-button secondary-button" data-action="next-step" data-query="\${escapeHtml(step)}">\${escapeHtml(step)}</button>\`
								).join('');
								return renderSection('Try next', \`<div class="suggestion-list">\${buttons}</div>\`);
							};

							const planHtml = plan.commands.length
								? \`
									<div class="command-actions">
										<button class="small-button secondary-button" data-action="copy-all">Copy All Commands</button>
									</div>
									<div class="command-list">\${plan.commands
										.map(
											(command, index) => \`
												<div class="command-item">
													<code>\${escapeHtml(command.command)}</code>
													<div class="command-actions">
														<button class="small-button secondary-button" data-action="copy-command" data-index="\${index}">Copy</button>
														\${
															command.safeToRun
																? \`<button class="small-button" data-action="run-command" data-index="\${index}">Run in Terminal</button>\`
																: ''
														}
													</div>
												</div>
											\`
										)
										.join('')}</div>\`
								: plan.repoAnswer
									? ''
									: '<p>No commands generated yet.</p>';

							const explanationsHtml = plan.commands.length
								? \`<div class="command-list">\${plan.commands
										.map(
											(command) => \`
												<div class="command-item">
													<code>\${escapeHtml(command.command)}</code>
													<p>\${escapeHtml(command.explanation)}</p>
												</div>
											\`
										)
										.join('')}</div>\`
								: '';

							outputEl.innerHTML = \`
								<div class="result-card \${escapeHtml(plan.kind)}">
									<p><strong>\${escapeHtml(plan.summary)}</strong></p>
									<div class="badge \${escapeHtml(plan.risk)}">Risk: \${escapeHtml(plan.risk)}</div>
									\${renderSection('What GitPal understood', \`<p>\${escapeHtml(plan.understood)}</p>\`)}
									\${renderClarificationOptions(plan.clarificationOptions)}
									\${renderFilePicker(plan.filePicker)}
									\${renderSection('Clarification questions', renderList(plan.clarificationQuestions, 'clarification'))}
									\${renderRepoAnswerSection('What I found', plan.repoAnswer?.whatIFound)}
									\${renderRepoAnswerSection('Staged', plan.repoAnswer?.staged)}
									\${renderRepoAnswerSection('Changed but not staged', plan.repoAnswer?.unstaged)}
									\${renderRepoAnswerSection('Untracked', plan.repoAnswer?.untracked)}
									\${renderRepoAnswerSection('Deleted', plan.repoAnswer?.deleted)}
									\${renderRepoAnswerSection('Conflicted', plan.repoAnswer?.conflicted)}
									\${renderNextSteps(plan.repoAnswer?.suggestedNextSteps)}
									\${renderSection('Plan', planHtml)}
									\${renderSection('Command explanations', explanationsHtml)}
									\${renderSection('Assumptions', renderList(plan.assumptions))}
									\${renderSection('Repo notes', renderList(plan.repoNotes))}
									\${renderSection('Warnings', renderList(plan.warnings, 'warning'))}
									<p id="status-line" class="status-line"></p>
								</div>
							\`;
						}
					});
				</script>
			</body>
			</html>
		`;
	}
}
