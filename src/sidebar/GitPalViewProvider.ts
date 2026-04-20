import * as vscode from 'vscode';
import { parseIntent } from '../core/intentParser';
import { buildPlan } from '../core/commandPlanner';

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

		webviewView.webview.onDidReceiveMessage((message) => {
			if (message.type === 'generatePlan') {
				const userText = String(message.value || '').trim();
				const intent = parseIntent(userText);
				const plan = buildPlan(intent);

				webviewView.webview.postMessage({
					type: 'planResult',
					value: plan
				});
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
					.output {
						margin-top: 16px;
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
					.hint {
						opacity: 0.75;
						font-size: 12px;
						margin-top: 10px;
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

					generateBtn.addEventListener('click', () => {
						const value = promptEl.value;
						vscode.postMessage({
							type: 'generatePlan',
							value
						});
					});

					window.addEventListener('message', (event) => {
						const message = event.data;

						if (message.type === 'planResult') {
							const plan = message.value;

							outputEl.innerHTML = \`
								<p><strong>\${plan.summary}</strong></p>
								<div class="badge \${plan.risk}">Risk: \${plan.risk}</div>
								<pre>\${plan.commands.length ? plan.commands.join('\\n') : 'No commands generated yet.'}</pre>
								\${
									plan.assumptions?.length
										? \`<p><strong>Assumptions</strong></p><ul>\${plan.assumptions
												.map((a) => \`<li>\${a}</li>\`)
												.join('')}</ul>\`
										: ''
								}
							\`;
						}
					});
				</script>
			</body>
			</html>
		`;
	}
}