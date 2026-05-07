export type RiskLevel = 'safe' | 'caution' | 'dangerous';
export type IntentKind = 'query' | 'action' | 'ambiguous' | 'unknown';
export type ResultKind = 'answer' | 'plan' | 'clarification';

export type ClarificationOption = {
	label: string;
	followUpQuery: string;
};

export type ParsedIntent =
	| { kind: 'query'; action: 'status' }
	| { kind: 'query'; action: 'repo_query'; query: RepoQueryKind }
	| { kind: 'action'; action: 'push_branch'; branch: string; targetFile?: string }
	| { kind: 'action'; action: 'create_and_push_branch'; branch: string; targetFile?: string }
	| { kind: 'action'; action: 'commit_and_push_branch'; branch: string; commitMessage: string; targetFile?: string }
	| { kind: 'ambiguous'; action: 'ambiguous_add_to_branch'; branch: string; targetFile: string }
	| { kind: 'unknown'; action: 'unknown' };

export type RepoQueryKind =
	| 'staged_files'
	| 'changed_files'
	| 'untracked_files'
	| 'deleted_files'
	| 'conflicted_files'
	| 'current_branch';

export type PlannedCommand = {
	command: string;
	explanation: string;
	safeToRun: boolean;
};

export type ChangedFile = {
	path: string;
	status: string;
};

export type RepoStatusSummary = {
	staged: ChangedFile[];
	unstaged: ChangedFile[];
	untracked: ChangedFile[];
	deleted: ChangedFile[];
	conflicted: ChangedFile[];
};

export type BranchState = {
	current?: string;
	upstream?: string;
	ahead: number;
	behind: number;
	isDetached: boolean;
};

export type RepoInspection = {
	isGitRepo: boolean;
	rootPath?: string;
	currentBranch?: string;
	branchState: BranchState;
	changedFiles: ChangedFile[];
	status: RepoStatusSummary;
	localBranches: string[];
	remoteBranches: string[];
	notes: string[];
	warnings: string[];
};

export type RepoAnswer = {
	whatIFound: string[];
	staged?: string[];
	unstaged?: string[];
	untracked?: string[];
	deleted?: string[];
	conflicted?: string[];
	suggestedNextSteps?: string[];
};

export type PlannedResult = {
	kind: ResultKind;
	summary: string;
	understood: string;
	commands: PlannedCommand[];
	risk: RiskLevel;
	assumptions?: string[];
	clarificationQuestions?: string[];
	clarificationOptions?: ClarificationOption[];
	filePicker?: { prompt: string; files: { path: string; followUpQuery: string }[] };
	repoAnswer?: RepoAnswer;
	repoNotes?: string[];
	warnings?: string[];
};
