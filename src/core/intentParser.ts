import { ParsedIntent } from './types';

export function parseIntent(input: string): ParsedIntent {
	const text = input.trim().toLowerCase();

	if (!text) {
		return { action: 'unknown' };
	}

	if (text.includes('status')) {
		return { action: 'status' };
	}

	const branchMatch =
		text.match(/branch called ([a-zA-Z0-9._/-]+)/) ||
		text.match(/branch named ([a-zA-Z0-9._/-]+)/) ||
		text.match(/to the ([a-zA-Z0-9._/-]+) branch/) ||
		text.match(/to ([a-zA-Z0-9._/-]+) branch/) ||
		text.match(/push .* to ([a-zA-Z0-9._/-]+)/);

	const branch = branchMatch?.[1];

	if (text.includes('push') && branch) {
		if (text.includes('commit')) {
			return {
				action: 'commit_and_push_branch',
				branch,
				commitMessage: 'update code'
			};
		}

		if (
			text.includes('new branch') ||
			text.includes('create branch') ||
			text.includes('create a branch')
		) {
			return {
				action: 'create_and_push_branch',
				branch
			};
		}

		return {
			action: 'push_branch',
			branch
		};
	}

	return { action: 'unknown' };
}