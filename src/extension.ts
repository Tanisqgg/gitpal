import * as vscode from 'vscode';
import { GitPalViewProvider } from './sidebar/GitPalViewProvider';

export function activate(context: vscode.ExtensionContext) {
	const provider = new GitPalViewProvider(context.extensionUri);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('gitpal.sidebar', provider)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('gitpal.open', async () => {
			await vscode.commands.executeCommand('workbench.view.extension.gitpal');
			vscode.window.showInformationMessage('GitPal opened');
		})
	);
}

export function deactivate() {}