import { ChangedFile, ClarificationOption, ParsedIntent, PlannedCommand, PlannedResult, RepoInspection, RepoQueryKind } from './types';

export function buildPlan(intent: ParsedIntent, repo?: RepoInspection): PlannedResult {
	switch (intent.action) {
		case 'status':
			return {
				kind: 'plan',
				summary: 'Show the current Git status.',
				understood: 'You want to check what Git sees in this repository.',
				commands: [
					command('git status', 'Shows the current branch and which files are changed, staged, or untracked.')
				],
				risk: 'safe',
				repoNotes: repo?.notes,
				warnings: repo?.warnings
			};

		case 'repo_query':
			return buildRepoQueryAnswer(intent.query, repo);

		case 'push_branch':
			return buildPushPlan(intent.branch, repo, intent.targetFile);

		case 'create_and_push_branch':
			return buildCreateAndPushPlan(intent.branch, repo, intent.targetFile);

		case 'commit_and_push_branch':
			return buildPushPlan(intent.branch, repo, intent.targetFile, intent.commitMessage);

		case 'ambiguous_add_to_branch':
			return buildAmbiguousAddPlan(intent.branch, intent.targetFile, repo);

		case 'unknown':
		default:
			return {
				kind: 'clarification',
				summary: "I'm not sure which Git action you want yet.",
				understood: 'Add a specific action and branch name and GitPal will build a safe plan.',
				commands: [],
				risk: 'caution',
				assumptions: [
					'Try: "push this code to the main branch".',
					'Try: "push only globals.css to the frontend branch".',
					'Or: "show git status".',
					'Or: "create a branch called frontend and push my code".'
				],
				repoNotes: repo?.notes,
				warnings: repo?.warnings
			};
	}
}

function buildRepoQueryAnswer(query: RepoQueryKind, repo: RepoInspection | undefined): PlannedResult {
	if (!repo?.isGitRepo) {
		return {
			summary: 'I could not inspect this repository yet.',
			kind: 'answer',
			understood: 'You asked a read-only question about the repository state.',
			commands: [],
			risk: 'safe',
			repoAnswer: {
				whatIFound: ['GitPal could not read Git status for the current workspace.'],
				suggestedNextSteps: ['Open a Git repository folder, then ask the question again.']
			},
			warnings: repo?.warnings
		};
	}

	const answer = {
		whatIFound: buildWhatIFound(query, repo),
		staged: toPathList(repo.status.staged),
		unstaged: toPathList(repo.status.unstaged),
		untracked: toPathList(repo.status.untracked),
		deleted: toPathList(repo.status.deleted),
		conflicted: toPathList(repo.status.conflicted),
		suggestedNextSteps: buildSuggestedNextSteps(query, repo)
	};

	return {
		kind: 'answer',
		summary: getRepoQuerySummary(query),
		understood: getRepoQueryUnderstanding(query),
		commands: [],
		risk: 'safe',
		repoAnswer: answer,
		repoNotes: repo.notes,
		warnings: repo.warnings
	};
}

function buildWhatIFound(query: RepoQueryKind, repo: RepoInspection): string[] {
	const stagedCount = repo.status.staged.length;
	const unstagedCount = repo.status.unstaged.length;
	const untrackedCount = repo.status.untracked.length;
	const deletedCount = repo.status.deleted.length;
	const conflictedCount = repo.status.conflicted.length;

	if (query === 'current_branch') {
		return buildBranchFindings(repo);
	}

	return [
		`Staged files: ${stagedCount}.`,
		`Changed but not staged files: ${unstagedCount}.`,
		`Untracked files: ${untrackedCount}.`,
		`Deleted files: ${deletedCount}.`,
		`Conflicted files: ${conflictedCount}.`
	];
}

function buildBranchFindings(repo: RepoInspection): string[] {
	const findings = [
		repo.currentBranch ? `You are on branch "${repo.currentBranch}".` : 'GitPal could not determine the current branch.'
	];

	if (repo.branchState.isDetached) {
		findings.push('Git reports a detached HEAD state, which means you are not currently on a normal branch.');
	}

	if (repo.branchState.upstream) {
		findings.push(`Upstream branch: "${repo.branchState.upstream}".`);
		findings.push(`Ahead by ${repo.branchState.ahead} commit(s), behind by ${repo.branchState.behind} commit(s).`);
	} else {
		findings.push('No upstream branch was detected.');
	}

	return findings;
}

function buildSuggestedNextSteps(query: RepoQueryKind, repo: RepoInspection): string[] {
	if (query === 'current_branch') {
		return [
			'Show what changed',
			'Push to this branch',
			'Switch to another branch'
		];
	}

	if (repo.changedFiles.length === 0) {
		return ['Show git status'];
	}

	if (query === 'staged_files') {
		return repo.status.staged.length
			? ['Commit staged files', 'Unstage a file', 'Show changed files']
			: ['Stage a file', 'Show changed files', 'Show untracked files'];
	}

	if (query === 'untracked_files') {
		return repo.status.untracked.length
			? ['Stage a file', 'Show changed files', 'Commit staged files']
			: ['Show changed files', 'Show staged files'];
	}

	if (query === 'deleted_files') {
		return repo.status.deleted.length
			? ['Stage a file', 'Commit staged files', 'Show changed files']
			: ['Show changed files', 'Show staged files'];
	}

	if (query === 'conflicted_files') {
		return repo.status.conflicted.length
			? ['Show staged files', 'Commit staged files', 'Show changed files']
			: ['Show changed files', 'Show staged files'];
	}

	return [
		'Stage a file',
		'Commit staged files',
		'Show untracked files',
		'Switch branch'
	];
}

function getRepoQuerySummary(query: RepoQueryKind): string {
	switch (query) {
		case 'staged_files':
			return 'Here are the files currently staged.';
		case 'changed_files':
			return 'Here is what has changed in this repository.';
		case 'untracked_files':
			return 'Here are the untracked files.';
		case 'deleted_files':
			return 'Here are the deleted files.';
		case 'conflicted_files':
			return 'Here are the conflicted files.';
		case 'current_branch':
			return 'Here is the current branch state.';
	}
}

function getRepoQueryUnderstanding(query: RepoQueryKind): string {
	switch (query) {
		case 'staged_files':
			return 'You want to know which files are staged for the next commit.';
		case 'changed_files':
			return 'You want to know what files have changed.';
		case 'untracked_files':
			return 'You want to know which files Git is not tracking yet.';
		case 'deleted_files':
			return 'You want to know which files Git sees as deleted.';
		case 'conflicted_files':
			return 'You want to know which files have merge conflicts.';
		case 'current_branch':
			return 'You want to know what branch you are currently on and whether it differs from its upstream.';
	}
}

function buildAmbiguousAddPlan(branch: string, targetFile: string, repo?: RepoInspection): PlannedResult {
	const options: ClarificationOption[] = [
		{ label: `Stage only ${targetFile}`, followUpQuery: `stage only ${targetFile}` },
		{ label: `Commit and push ${targetFile} to ${branch}`, followUpQuery: `push only ${targetFile} to ${branch} branch` },
		{ label: 'Show matching changed files first', followUpQuery: 'what changed?' }
	];

	return {
		kind: 'clarification',
		summary: 'This could mean more than one Git workflow.',
		understood: `You mentioned "${targetFile}" and the "${branch}" branch, but "add to branch" could mean more than one Git workflow.`,
		commands: [],
		risk: 'caution',
		clarificationQuestions: [
			`Do you want to stage only ${targetFile}, or commit and push it to ${branch}?`
		],
		clarificationOptions: options,
		assumptions: [
			'I did not create commands because staging a file and pushing it to a branch are different actions.'
		],
		repoNotes: repo?.notes,
		warnings: repo?.warnings
	};
}

function buildPushPlan(
	branch: string,
	repo: RepoInspection | undefined,
	targetFile?: string,
	commitMessage?: string
): PlannedResult {
	const fileScope = resolveFileScope(targetFile, repo);
	const branchPlan = resolveBranchSwitch(branch, repo, false);
	const warnings = [...(repo?.warnings ?? []), ...fileScope.warnings, ...branchPlan.warnings];
	const assumptions = [...branchPlan.assumptions, ...fileScope.assumptions];

	if (fileScope.blocked) {
		return {
			kind: 'clarification',
			summary: `More than one file matches that name. Which one did you mean?`,
			understood: `You asked to push one specific file to "${branch}", but the file name matched more than one changed file.`,
			commands: [],
			risk: 'caution',
			assumptions,
			filePicker: fileScope.matchedFiles?.length
				? {
					prompt: `Which file did you mean to push to "${branch}"?`,
					files: fileScope.matchedFiles.map((f) => ({
						path: f.path,
						followUpQuery: `push only ${f.path} to ${branch} branch`
					}))
				}
				: undefined,
			repoNotes: repo?.notes,
			warnings
		};
	}

	const gitAddTarget = fileScope.stageTarget ?? '.';
	const message = commitMessage ?? (fileScope.stageTarget ? `update ${getFileName(fileScope.stageTarget)}` : 'update code');

	return {
		kind: 'plan',
		summary: fileScope.stageTarget
			? `Push only "${fileScope.stageTarget}" to branch "${branch}".`
			: `Push current work to branch "${branch}".`,
		understood: fileScope.stageTarget
			? `You want to commit and push only "${fileScope.stageTarget}" to "${branch}".`
			: `You want to commit and push your current work to "${branch}".`,
		commands: [
			branchPlan.switchCommand,
			command(`git add ${quotePath(gitAddTarget)}`, fileScope.stageTarget
				? `Stages only "${fileScope.stageTarget}" so other changed files stay unstaged.`
				: 'Stages all changed files because no specific file was requested.'),
			command(`git commit -m "${escapeCommitMessage(message)}"`, `Creates a commit with the message "${message}".`),
			command(`git push origin ${branch}`, `Uploads the commit to the "${branch}" branch on origin.`)
		],
		risk: 'caution',
		assumptions,
		repoNotes: repo?.notes,
		warnings
	};
}

function buildCreateAndPushPlan(
	branch: string,
	repo: RepoInspection | undefined,
	targetFile?: string
): PlannedResult {
	const fileScope = resolveFileScope(targetFile, repo);

	if (fileScope.blocked) {
		return {
			kind: 'clarification',
			summary: `More than one file matches that name. Which one did you mean?`,
			understood: `You asked to include one specific file, but the file name matched more than one changed file.`,
			commands: [],
			risk: 'caution',
			assumptions: fileScope.assumptions,
			filePicker: fileScope.matchedFiles?.length
				? {
					prompt: `Which file did you want to include in "${branch}"?`,
					files: fileScope.matchedFiles.map((f) => ({
						path: f.path,
						followUpQuery: `create branch ${branch} and push only ${f.path}`
					}))
				}
				: undefined,
			repoNotes: repo?.notes,
			warnings: [...(repo?.warnings ?? []), ...fileScope.warnings]
		};
	}

	const gitAddTarget = fileScope.stageTarget ?? '.';
	const message = fileScope.stageTarget ? `update ${getFileName(fileScope.stageTarget)}` : 'update code';

	return {
		kind: 'plan',
		summary: `Create branch "${branch}" and push current work.`,
		understood: fileScope.stageTarget
			? `You want to create "${branch}", commit only "${fileScope.stageTarget}", and push it.`
			: `You want to create "${branch}", commit your current work, and push it.`,
		commands: [
			command(`git switch -c ${branch}`, `Creates and switches to a new local branch named "${branch}".`),
			command(`git add ${quotePath(gitAddTarget)}`, fileScope.stageTarget
				? `Stages only "${fileScope.stageTarget}" so other changed files stay unstaged.`
				: 'Stages all changed files because no specific file was requested.'),
			command(`git commit -m "${escapeCommitMessage(message)}"`, `Creates a commit with the message "${message}".`),
			command(`git push -u origin ${branch}`, `Uploads the new branch to origin and links your local branch to it.`)
		],
		risk: 'safe',
		assumptions: fileScope.assumptions,
		repoNotes: repo?.notes,
		warnings: [...(repo?.warnings ?? []), ...fileScope.warnings]
	};
}

function resolveFileScope(
	targetFile: string | undefined,
	repo: RepoInspection | undefined
): { stageTarget?: string; assumptions: string[]; warnings: string[]; blocked?: boolean; matchedFiles?: ChangedFile[] } {
	if (!targetFile) {
		return {
			assumptions: ['I assumed you want to stage all changed files because no specific file was requested.'],
			warnings: []
		};
	}

	if (!repo?.isGitRepo) {
		return {
			stageTarget: targetFile,
			assumptions: [`I treated "${targetFile}" as the file path because Git status was unavailable.`],
			warnings: ['GitPal could not confirm whether the requested file is changed.']
		};
	}

	const matches = findChangedFileMatches(targetFile, repo.changedFiles);

	if (matches.length === 1) {
		return {
			stageTarget: matches[0].path,
			assumptions: [`I matched "${targetFile}" to changed file "${matches[0].path}".`],
			warnings: []
		};
	}

	if (matches.length > 1) {
		return {
			assumptions: [],
			warnings: [
				`More than one changed file matches "${targetFile}": ${matches.map((file) => file.path).join(', ')}. Use a fuller path.`
			],
			blocked: true,
			matchedFiles: matches
		};
	}

	return {
		stageTarget: targetFile,
		assumptions: [`I kept the requested path "${targetFile}", but GitPal did not find it in changed files.`],
		warnings: [`"${targetFile}" does not appear in the changed files. Git may have nothing to commit for that file.`]
	};
}

function resolveBranchSwitch(
	branch: string,
	repo: RepoInspection | undefined,
	createBranch: boolean
): { switchCommand: PlannedCommand; assumptions: string[]; warnings: string[] } {
	if (createBranch) {
		return {
			switchCommand: command(`git switch -c ${branch}`, `Creates and switches to a new local branch named "${branch}".`),
			assumptions: [],
			warnings: []
		};
	}

	if (repo?.localBranches.includes(branch)) {
		return {
			switchCommand: command(`git switch ${branch}`, `Switches your working copy to the existing local "${branch}" branch.`),
			assumptions: [`I confirmed local branch "${branch}" exists.`],
			warnings: []
		};
	}

	if (repo?.remoteBranches.includes(branch)) {
		return {
			switchCommand: command(
				`git switch --track origin/${branch}`,
				`Creates a local "${branch}" branch that tracks "origin/${branch}", then switches to it.`
			),
			assumptions: [`I found "origin/${branch}" but not a local "${branch}" branch.`],
			warnings: []
		};
	}

	return {
		switchCommand: command(`git switch ${branch}`, `Switches your working copy to the "${branch}" branch.`),
		assumptions: [`I assumed branch "${branch}" already exists.`],
		warnings: repo?.isGitRepo ? [`GitPal did not find a local or origin branch named "${branch}".`] : []
	};
}

function findChangedFileMatches(targetFile: string, changedFiles: ChangedFile[]): ChangedFile[] {
	const normalizedTarget = normalizeForMatch(targetFile);

	return changedFiles.filter((file) => {
		const normalizedPath = normalizeForMatch(file.path);
		return normalizedPath === normalizedTarget || getFileName(normalizedPath) === normalizedTarget;
	});
}

function toPathList(files: ChangedFile[]): string[] {
	return files.map((file) => `${file.path} (${describeStatus(file.status)})`);
}

function describeStatus(status: string): string {
	if (status === '??') {
		return 'untracked';
	}

	if (status.includes('D')) {
		return 'deleted';
	}

	if (status.includes('A')) {
		return 'added';
	}

	if (status.includes('M')) {
		return 'modified';
	}

	if (status.includes('R')) {
		return 'renamed';
	}

	return status;
}

function command(commandText: string, explanation: string): PlannedCommand {
	return {
		command: commandText,
		explanation,
		safeToRun: isSafeToRun(commandText)
	};
}

function quotePath(filePath: string): string {
	return /^[a-zA-Z0-9._/-]+$/.test(filePath) ? filePath : `"${filePath.replace(/"/g, '\\"')}"`;
}

function escapeCommitMessage(message: string): string {
	return message.replace(/"/g, '\\"');
}

function normalizeForMatch(filePath: string): string {
	return filePath.replace(/\\/g, '/').toLowerCase();
}

function getFileName(filePath: string): string {
	return filePath.replace(/\\/g, '/').split('/').at(-1) ?? filePath;
}

function isSafeToRun(commandText: string): boolean {
	return commandText === 'git status' || /^git add (?!\.$)[a-zA-Z0-9._/" -]+$/.test(commandText);
}
