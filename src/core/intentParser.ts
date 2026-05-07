import { ParsedIntent, RepoQueryKind } from './types';

export function parseIntent(input: string): ParsedIntent {
	const trimmedInput = input.trim();
	const text = trimmedInput.toLowerCase();

	if (!text) {
		return { kind: 'unknown', action: 'unknown' };
	}

	const repoQuery = parseRepoQuery(text);

	if (repoQuery) {
		return {
			kind: 'query',
			action: 'repo_query',
			query: repoQuery
		};
	}

	if (text.includes('status')) {
		return { kind: 'query', action: 'status' };
	}

	const branchMatch =
		text.match(/branch called ([a-zA-Z0-9._/-]+)/) ||
		text.match(/branch named ([a-zA-Z0-9._/-]+)/) ||
		text.match(/to the ([a-zA-Z0-9._/-]+) branch/) ||
		text.match(/to ([a-zA-Z0-9._/-]+) branch/) ||
		text.match(/push .* to ([a-zA-Z0-9._/-]+)/);

	const branch = branchMatch?.[1];
	const targetFile = extractTargetFile(trimmedInput);
	const ambiguousAdd = extractAmbiguousAddToBranch(trimmedInput);

	if (ambiguousAdd && !text.includes('push') && !text.includes('commit') && !text.includes('stage')) {
		return {
			kind: 'ambiguous',
			action: 'ambiguous_add_to_branch',
			branch: ambiguousAdd.branch,
			targetFile: ambiguousAdd.targetFile
		};
	}

	if (text.includes('push') && branch) {
		if (text.includes('commit')) {
			return {
				kind: 'action',
				action: 'commit_and_push_branch',
				branch,
				commitMessage: targetFile ? `update ${targetFile}` : 'update code',
				targetFile
			};
		}

		if (
			text.includes('new branch') ||
			text.includes('create branch') ||
			text.includes('create a branch')
		) {
			return {
				kind: 'action',
				action: 'create_and_push_branch',
				branch,
				targetFile
			};
		}

		return {
			kind: 'action',
			action: 'push_branch',
			branch,
			targetFile
		};
	}

	return { kind: 'unknown', action: 'unknown' };
}

function parseRepoQuery(text: string): RepoQueryKind | undefined {
	if (
		text.includes('what branch') ||
		text.includes('which branch') ||
		text.includes('current branch') ||
		text.includes('branch am i on') ||
		text.includes('ahead or behind') ||
		text.includes('behind origin') ||
		text.includes('ahead of origin')
	) {
		return 'current_branch';
	}

	if (text.includes('staged')) {
		return 'staged_files';
	}

	if (text.includes('untracked')) {
		return 'untracked_files';
	}

	if (text.includes('deleted') || text.includes('removed')) {
		return 'deleted_files';
	}

	if (text.includes('conflict') || text.includes('conflicted') || text.includes('merge problem')) {
		return 'conflicted_files';
	}

	if (
		text.includes('what has changed') ||
		text.includes('what changed') ||
		text.includes('changed files') ||
		text.includes('files changed') ||
		text.includes('modified files') ||
		text.includes('repo clean') ||
		text.includes('repository clean') ||
		text.includes('working tree clean')
	) {
		return 'changed_files';
	}

	return undefined;
}

function extractTargetFile(input: string): string | undefined {
	const fileMatch = input.match(
		/\b(?:only|just)\s+(?:the\s+)?(?:file\s+)?["'`]?([^"'`,\s]+)["'`]?(?:\s+file)?/i
	);

	return fileMatch?.[1];
}

function extractAmbiguousAddToBranch(input: string): { targetFile: string; branch: string } | undefined {
	const match = input.match(
		/\badd\s+["'`]?([^"'`,\s]+)["'`]?\s+to\s+(?:the\s+)?([a-zA-Z0-9._/-]+)\s+branch\b/i
	);

	if (!match?.[1] || !match[2]) {
		return undefined;
	}

	return {
		targetFile: match[1],
		branch: match[2]
	};
}
