export type RiskLevel = 'safe' | 'caution' | 'dangerous';

export type ParsedIntent =
	| { action: 'status' }
	| { action: 'push_branch'; branch: string }
	| { action: 'create_and_push_branch'; branch: string }
	| { action: 'commit_and_push_branch'; branch: string; commitMessage: string }
	| { action: 'unknown' };

export type PlannedResult = {
	summary: string;
	commands: string[];
	risk: RiskLevel;
	assumptions?: string[];
};