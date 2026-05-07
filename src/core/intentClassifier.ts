import { parseIntent } from './intentParser';
import { ParsedIntent, RepoQueryKind } from './types';

export type LocalLlmIntentJson = {
	kind: 'query' | 'action' | 'ambiguous' | 'unknown';
	action:
		| 'status'
		| 'repo_query'
		| 'push_branch'
		| 'create_and_push_branch'
		| 'commit_and_push_branch'
		| 'ambiguous_add_to_branch'
		| 'unknown';
	query?: RepoQueryKind;
	branch?: string;
	targetFile?: string;
	commitMessage?: string;
};

export type LocalIntentClassifier = (input: string) => Promise<LocalLlmIntentJson | undefined>;

export async function classifyIntent(
	input: string,
	localClassifier?: LocalIntentClassifier
): Promise<ParsedIntent> {
	const ruleIntent = parseIntent(input);

	if (ruleIntent.kind !== 'unknown' || !localClassifier) {
		return ruleIntent;
	}

	const modelJson = await localClassifier(input);
	return normalizeModelIntent(modelJson);
}

function normalizeModelIntent(modelJson: LocalLlmIntentJson | undefined): ParsedIntent {
	if (!modelJson || modelJson.kind === 'unknown' || modelJson.action === 'unknown') {
		return { kind: 'unknown', action: 'unknown' };
	}

	if (modelJson.kind === 'query') {
		if (modelJson.action === 'status') {
			return { kind: 'query', action: 'status' };
		}

		if (modelJson.action === 'repo_query' && modelJson.query) {
			return {
				kind: 'query',
				action: 'repo_query',
				query: modelJson.query
			};
		}
	}

	if (modelJson.kind === 'ambiguous' && modelJson.action === 'ambiguous_add_to_branch') {
		if (modelJson.branch && modelJson.targetFile) {
			return {
				kind: 'ambiguous',
				action: 'ambiguous_add_to_branch',
				branch: modelJson.branch,
				targetFile: modelJson.targetFile
			};
		}
	}

	if (modelJson.kind === 'action' && modelJson.branch) {
		if (modelJson.action === 'push_branch') {
			return {
				kind: 'action',
				action: 'push_branch',
				branch: modelJson.branch,
				targetFile: modelJson.targetFile
			};
		}

		if (modelJson.action === 'create_and_push_branch') {
			return {
				kind: 'action',
				action: 'create_and_push_branch',
				branch: modelJson.branch,
				targetFile: modelJson.targetFile
			};
		}

		if (modelJson.action === 'commit_and_push_branch') {
			return {
				kind: 'action',
				action: 'commit_and_push_branch',
				branch: modelJson.branch,
				targetFile: modelJson.targetFile,
				commitMessage: modelJson.commitMessage ?? 'update code'
			};
		}
	}

	return { kind: 'unknown', action: 'unknown' };
}
