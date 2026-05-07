import { execFile } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { BranchState, ChangedFile, RepoInspection, RepoStatusSummary } from './types';

const emptyStatus: RepoStatusSummary = {
	staged: [],
	unstaged: [],
	untracked: [],
	deleted: [],
	conflicted: []
};

const emptyBranchState: BranchState = {
	ahead: 0,
	behind: 0,
	isDetached: false
};

export async function inspectRepo(): Promise<RepoInspection> {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

	if (!workspaceFolder) {
		return {
			isGitRepo: false,
			branchState: emptyBranchState,
			changedFiles: [],
			status: emptyStatus,
			localBranches: [],
			remoteBranches: [],
			notes: [],
			warnings: ['Open a workspace folder so GitPal can inspect Git status.']
		};
	}

	const cwd = workspaceFolder.uri.fsPath;

	try {
		const [statusOutput, branchOutput] = await Promise.all([
			runGit(['status', '--porcelain=v1', '--branch'], cwd),
			runGit(['branch', '--list', '--all', '--format=%(refname:short)'], cwd)
		]);

		const status = parseGitStatus(statusOutput);

		return {
			isGitRepo: true,
			rootPath: cwd,
			currentBranch: status.currentBranch,
			branchState: status.branchState,
			changedFiles: status.changedFiles,
			status: status.summary,
			localBranches: parseLocalBranches(branchOutput),
			remoteBranches: parseRemoteBranches(branchOutput),
			notes: [
				status.currentBranch
					? `Current branch appears to be "${status.currentBranch}".`
					: 'Current branch could not be determined.',
				describeBranchState(status.branchState),
				status.changedFiles.length
					? `Detected ${status.changedFiles.length} changed file(s).`
					: 'No changed files were detected.',
				status.summary.conflicted.length
					? `Detected ${status.summary.conflicted.length} conflicted file(s).`
					: 'No conflicted files were detected.'
			],
			warnings: []
		};
	} catch {
		return {
			isGitRepo: false,
			rootPath: cwd,
			branchState: emptyBranchState,
			changedFiles: [],
			status: emptyStatus,
			localBranches: [],
			remoteBranches: [],
			notes: [],
			warnings: ['GitPal could not inspect this folder as a Git repository.']
		};
	}
}

function runGit(args: string[], cwd: string): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile('git', args, { cwd }, (error, stdout) => {
			if (error) {
				reject(error);
				return;
			}

			resolve(stdout);
		});
	});
}

export function parseGitStatus(output: string): {
	currentBranch?: string;
	branchState: BranchState;
	changedFiles: ChangedFile[];
	summary: RepoStatusSummary;
} {
	const changedFiles: ChangedFile[] = [];
	const summary: RepoStatusSummary = {
		staged: [],
		unstaged: [],
		untracked: [],
		deleted: [],
		conflicted: []
	};
	let branchState: BranchState = { ...emptyBranchState };

	for (const line of output.split(/\r?\n/)) {
		if (!line) {
			continue;
		}

		if (line.startsWith('## ')) {
			branchState = parseBranchState(line.slice(3));
			continue;
		}

		const indexStatus = line[0];
		const workTreeStatus = line[1];
		const status = line.slice(0, 2).trim() || 'modified';
		const rawPath = line.slice(3);
		const filePath = rawPath.includes(' -> ') ? rawPath.split(' -> ').at(-1) ?? rawPath : rawPath;
		const changedFile = {
			path: normalizeGitPath(filePath),
			status
		};

		changedFiles.push(changedFile);
		addStatusCategory(summary, changedFile, indexStatus, workTreeStatus);
	}

	return { currentBranch: branchState.current, branchState, changedFiles, summary };
}

function parseBranchState(branchLine: string): BranchState {
	const state: BranchState = {
		ahead: 0,
		behind: 0,
		isDetached: branchLine.startsWith('HEAD ')
	};
	const [branchPart, trackingPart] = branchLine.split('...');
	const current = branchPart.trim();

	state.current = current || undefined;

	if (state.isDetached || current === 'HEAD (no branch)') {
		state.current = undefined;
		state.isDetached = true;
	}

	if (trackingPart) {
		const upstreamMatch = trackingPart.match(/^([^\s[]+)/);
		state.upstream = upstreamMatch?.[1];

		const aheadMatch = trackingPart.match(/ahead (\d+)/);
		const behindMatch = trackingPart.match(/behind (\d+)/);
		state.ahead = aheadMatch ? Number(aheadMatch[1]) : 0;
		state.behind = behindMatch ? Number(behindMatch[1]) : 0;
	}

	return state;
}

function addStatusCategory(
	summary: RepoStatusSummary,
	changedFile: ChangedFile,
	indexStatus: string,
	workTreeStatus: string
): void {
	if (isConflictStatus(indexStatus, workTreeStatus)) {
		summary.conflicted.push(changedFile);
	}

	if (indexStatus === '?' && workTreeStatus === '?') {
		summary.untracked.push(changedFile);
		return;
	}

	if (indexStatus !== ' ' && indexStatus !== '?') {
		summary.staged.push(changedFile);
	}

	if (workTreeStatus !== ' ' && workTreeStatus !== '?') {
		summary.unstaged.push(changedFile);
	}

	if (indexStatus === 'D' || workTreeStatus === 'D') {
		summary.deleted.push(changedFile);
	}
}

function isConflictStatus(indexStatus: string, workTreeStatus: string): boolean {
	const pair = `${indexStatus}${workTreeStatus}`;
	return ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(pair);
}

function parseLocalBranches(output: string): string[] {
	return output
		.split(/\r?\n/)
		.map((branch) => branch.trim())
		.filter((branch) => branch && !branch.startsWith('origin/'));
}

function parseRemoteBranches(output: string): string[] {
	return output
		.split(/\r?\n/)
		.map((branch) => branch.trim())
		.filter((branch) => branch.startsWith('origin/'))
		.map((branch) => branch.replace(/^origin\//, ''))
		.filter((branch) => branch !== 'HEAD');
}

function describeBranchState(branchState: BranchState): string {
	if (branchState.isDetached) {
		return 'Repository appears to be in detached HEAD state.';
	}

	if (!branchState.upstream) {
		return 'No upstream branch was detected from Git status.';
	}

	if (branchState.ahead || branchState.behind) {
		return `Compared with "${branchState.upstream}": ahead ${branchState.ahead}, behind ${branchState.behind}.`;
	}

	return `Branch is tracking "${branchState.upstream}" with no ahead/behind difference detected.`;
}

function normalizeGitPath(filePath: string): string {
	return filePath.split(path.sep).join('/');
}
