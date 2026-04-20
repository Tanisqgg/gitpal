import { ParsedIntent, PlannedResult } from './types';

export function buildPlan(intent: ParsedIntent): PlannedResult {
	switch (intent.action) {
		case 'status':
			return {
				summary: 'Show the current Git status.',
				commands: ['git status'],
				risk: 'safe'
			};

		case 'push_branch':
			return {
				summary: `Push current work to branch "${intent.branch}".`,
				commands: [
					`git switch ${intent.branch}`,
					'git add .',
					'git commit -m "update code"',
					`git push origin ${intent.branch}`
				],
				risk: 'caution',
				assumptions: [
					`I assumed branch "${intent.branch}" already exists.`,
					'I assumed you want to stage all changed files.',
					'I assumed a generic commit message is acceptable.'
				]
			};

		case 'create_and_push_branch':
			return {
				summary: `Create branch "${intent.branch}" and push current work.`,
				commands: [
					`git switch -c ${intent.branch}`,
					'git add .',
					'git commit -m "update code"',
					`git push -u origin ${intent.branch}`
				],
				risk: 'safe',
				assumptions: [
					'I assumed you want to stage all changed files.',
					'I assumed a generic commit message is acceptable.'
				]
			};

		case 'commit_and_push_branch':
			return {
				summary: `Commit changes and push to branch "${intent.branch}".`,
				commands: [
					`git switch ${intent.branch}`,
					'git add .',
					`git commit -m "${intent.commitMessage}"`,
					`git push origin ${intent.branch}`
				],
				risk: 'caution',
				assumptions: [
					`I assumed branch "${intent.branch}" already exists.`,
					'I assumed you want to stage all changed files.'
				]
			};

		case 'unknown':
		default:
			return {
				summary: 'I could not confidently understand that Git request yet.',
				commands: [],
				risk: 'caution',
				assumptions: [
					'Try: "push this code to the main branch".',
					'Or: "show git status".',
					'Or: "create a branch called frontend and push my code".'
				]
			};
	}
}