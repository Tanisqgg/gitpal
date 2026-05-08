import * as assert from 'assert';
import { buildPlan } from '../core/commandPlanner';
import { classifyIntent, LocalLlmIntentJson } from '../core/intentClassifier';
import { parseIntent } from '../core/intentParser';
import { parseGitStatus } from '../core/repoInspector';
import { ChangedFile, RepoInspection, RepoQueryKind } from '../core/types';

suite('GitPal core behavior', () => {
	suite('query intent parsing', () => {
		const cases: Array<{ prompt: string; query: RepoQueryKind }> = [
			{ prompt: 'what branch am I on', query: 'current_branch' },
			{ prompt: 'which files are staged', query: 'staged_files' },
			{ prompt: 'what has changed', query: 'changed_files' },
			{ prompt: 'what files are untracked', query: 'untracked_files' },
			{ prompt: 'do I have conflicts', query: 'conflicted_files' },
			{ prompt: 'what files are deleted', query: 'deleted_files' },
			{ prompt: 'is my repo clean', query: 'changed_files' },
			{ prompt: 'am I ahead or behind origin', query: 'current_branch' }
		];

		for (const testCase of cases) {
			test(`classifies "${testCase.prompt}" as a repo query`, () => {
				const intent = parseIntent(testCase.prompt);

				assert.strictEqual(intent.kind, 'query');
				assert.strictEqual(intent.action, 'repo_query');
				assert.strictEqual(intent.query, testCase.query);
			});
		}
	});

	suite('action and ambiguous intent parsing', () => {
		test('classifies branch push requests', () => {
			assert.deepStrictEqual(parseIntent('push this code to the main branch'), {
				kind: 'action',
				action: 'push_branch',
				branch: 'main',
				targetFile: undefined
			});
		});

		test('captures file-specific push requests', () => {
			assert.deepStrictEqual(parseIntent('push only globals.css to frontend branch'), {
				kind: 'action',
				action: 'push_branch',
				branch: 'frontend',
				targetFile: 'globals.css'
			});
		});

		test('classifies add-to-branch phrasing as ambiguous', () => {
			assert.deepStrictEqual(parseIntent('help me add globals.css to frontend branch'), {
				kind: 'ambiguous',
				action: 'ambiguous_add_to_branch',
				branch: 'frontend',
				targetFile: 'globals.css'
			});
		});
	});

	suite('local LLM classifier boundary', () => {
		test('uses rule-based intent before calling fallback classifier', async () => {
			let called = false;
			const intent = await classifyIntent('what branch am I on', async () => {
				called = true;
				return { kind: 'unknown', action: 'unknown' };
			});

			assert.strictEqual(called, false);
			assert.strictEqual(intent.kind, 'query');
		});

		test('normalizes structured fallback JSON into a known intent', async () => {
			const fallbackJson: LocalLlmIntentJson = {
				kind: 'query',
				action: 'repo_query',
				query: 'untracked_files'
			};

			const intent = await classifyIntent('new files?', async () => fallbackJson);

			assert.deepStrictEqual(intent, {
				kind: 'query',
				action: 'repo_query',
				query: 'untracked_files'
			});
		});

		test('rejects incomplete fallback JSON instead of guessing', async () => {
			const intent = await classifyIntent('ship it', async () => ({
				kind: 'action',
				action: 'push_branch'
			}));

			assert.deepStrictEqual(intent, { kind: 'unknown', action: 'unknown' });
		});
	});

	suite('git status parsing', () => {
		test('parses porcelain status into beginner-facing categories', () => {
			const parsed = parseGitStatus([
				'## feature...origin/feature [ahead 2, behind 1]',
				'M  src/staged.ts',
				' M src/unstaged.ts',
				'?? src/new.ts',
				' D src/deleted.ts',
				'UU src/conflicted.ts'
			].join('\n'));

			assert.strictEqual(parsed.currentBranch, 'feature');
			assert.strictEqual(parsed.branchState.upstream, 'origin/feature');
			assert.strictEqual(parsed.branchState.ahead, 2);
			assert.strictEqual(parsed.branchState.behind, 1);
			assert.deepStrictEqual(paths(parsed.summary.staged), ['src/staged.ts', 'src/conflicted.ts']);
			assert.deepStrictEqual(paths(parsed.summary.unstaged), ['src/unstaged.ts', 'src/deleted.ts', 'src/conflicted.ts']);
			assert.deepStrictEqual(paths(parsed.summary.untracked), ['src/new.ts']);
			assert.deepStrictEqual(paths(parsed.summary.deleted), ['src/deleted.ts']);
			assert.deepStrictEqual(paths(parsed.summary.conflicted), ['src/conflicted.ts']);
		});
	});

	suite('query answers', () => {
		test('returns answer cards with no commands for repo-state questions', () => {
			const result = buildPlan({ kind: 'query', action: 'repo_query', query: 'changed_files' }, repoFixture());

			assert.strictEqual(result.kind, 'answer');
			assert.strictEqual(result.risk, 'safe');
			assert.deepStrictEqual(result.commands, []);
			assert.ok(result.repoAnswer?.whatIFound.some((line) => line.includes('Staged files: 1.')));
			assert.deepStrictEqual(result.repoAnswer?.staged, ['src/staged.ts (modified)']);
			assert.deepStrictEqual(result.repoAnswer?.unstaged, ['src/unstaged.ts (modified)']);
			assert.deepStrictEqual(result.repoAnswer?.untracked, ['src/new.ts (untracked)']);
			assert.deepStrictEqual(result.repoAnswer?.deleted, ['src/deleted.ts (deleted)']);
			assert.deepStrictEqual(result.repoAnswer?.conflicted, ['src/conflicted.ts (UU)']);
		});

		test('explains current branch state with upstream counts', () => {
			const result = buildPlan({ kind: 'query', action: 'repo_query', query: 'current_branch' }, repoFixture());

			assert.strictEqual(result.kind, 'answer');
			assert.ok(result.repoAnswer?.whatIFound.includes('You are on branch "feature".'));
			assert.ok(result.repoAnswer?.whatIFound.includes('Upstream branch: "origin/feature".'));
			assert.ok(result.repoAnswer?.whatIFound.includes('Ahead by 2 commit(s), behind by 1 commit(s).'));
		});

		test('handles non-git repositories without commands', () => {
			const result = buildPlan({ kind: 'query', action: 'repo_query', query: 'changed_files' }, nonGitRepoFixture());

			assert.strictEqual(result.kind, 'answer');
			assert.strictEqual(result.risk, 'safe');
			assert.deepStrictEqual(result.commands, []);
			assert.ok(result.warnings?.some((warning) => warning.includes('Git repository')));
		});
	});

	suite('action plans and file matching', () => {
		test('uses existing local branch and stages only the matched file', () => {
			const result = buildPlan(
				{ kind: 'action', action: 'push_branch', branch: 'frontend', targetFile: 'globals.css' },
				repoFixture()
			);

			assert.strictEqual(result.kind, 'plan');
			assert.deepStrictEqual(commandTexts(result), [
				'git switch frontend',
				'git add src/styles/globals.css',
				'git commit -m "update globals.css"',
				'git push origin frontend'
			]);
			assert.ok(!commandTexts(result).includes('git add .'));
		});

		test('uses remote tracking branch when branch only exists on origin', () => {
			const result = buildPlan(
				{ kind: 'action', action: 'push_branch', branch: 'remote-only' },
				repoFixture({ localBranches: ['main'], remoteBranches: ['remote-only'] })
			);

			assert.strictEqual(commandTexts(result)[0], 'git switch --track origin/remote-only');
		});

		test('warns when requested file is not changed', () => {
			const result = buildPlan(
				{ kind: 'action', action: 'push_branch', branch: 'frontend', targetFile: 'missing.css' },
				repoFixture()
			);

			assert.strictEqual(result.kind, 'plan');
			assert.ok(result.warnings?.some((warning) => warning.includes('does not appear in the changed files')));
			assert.ok(commandTexts(result).includes('git add missing.css'));
		});

		test('asks for clarification when a basename matches multiple changed files', () => {
			const result = buildPlan(
				{ kind: 'action', action: 'push_branch', branch: 'frontend', targetFile: 'globals.css' },
				repoFixture({
					changedFiles: [
						file('src/styles/globals.css', 'M'),
						file('apps/web/globals.css', 'M')
					]
				})
			);

			assert.strictEqual(result.kind, 'clarification');
			assert.deepStrictEqual(result.commands, []);
			assert.ok(result.warnings?.some((warning) => warning.includes('More than one changed file matches')));
		});
	});

	suite('ambiguous requests and safety guardrails', () => {
		test('ambiguous add-to-branch request generates a clarification card only', () => {
			const result = buildPlan({
				kind: 'ambiguous',
				action: 'ambiguous_add_to_branch',
				branch: 'frontend',
				targetFile: 'globals.css'
			}, repoFixture());

			assert.strictEqual(result.kind, 'clarification');
			assert.deepStrictEqual(result.commands, []);
			assert.ok(result.clarificationQuestions?.[0].includes('stage only globals.css'));
		});

		test('unknown beginner requests do not generate dangerous guesses', () => {
			for (const prompt of ['save my work', 'fix my repo', 'undo my changes']) {
				const result = buildPlan(parseIntent(prompt), repoFixture());

				assert.strictEqual(result.kind, 'clarification');
				assert.deepStrictEqual(result.commands, []);
			}
		});

		test('never marks destructive commands safe in generated plans', () => {
			const dangerousFragments = ['reset --hard', 'push --force', 'clean -fd', 'rebase -i'];
			const plans = [
				buildPlan({ kind: 'query', action: 'status' }, repoFixture()),
				buildPlan({ kind: 'action', action: 'push_branch', branch: 'frontend' }, repoFixture()),
				buildPlan({
					kind: 'action',
					action: 'create_and_push_branch',
					branch: 'frontend'
				}, repoFixture())
			];

			for (const plan of plans) {
				for (const command of plan.commands) {
					assert.ok(!dangerousFragments.some((fragment) => command.command.includes(fragment)));
					assert.strictEqual(
						command.safeToRun,
						command.command === 'git status' || (command.command.startsWith('git add ') && command.command !== 'git add .')
					);
				}
			}
		});
	});

	suite('clarification buttons', () => {
		test('ambiguous plan includes clarificationOptions', () => {
			const result = buildPlan({
				kind: 'ambiguous',
				action: 'ambiguous_add_to_branch',
				branch: 'frontend',
				targetFile: 'globals.css'
			}, repoFixture());

			assert.ok(Array.isArray(result.clarificationOptions));
			assert.ok((result.clarificationOptions?.length ?? 0) >= 2);
		});

		test('clarificationOptions cover a stage-only action and a push action', () => {
			const result = buildPlan({
				kind: 'ambiguous',
				action: 'ambiguous_add_to_branch',
				branch: 'frontend',
				targetFile: 'globals.css'
			}, repoFixture());

			const opts = result.clarificationOptions ?? [];
			assert.ok(opts.some((o) => o.label.toLowerCase().includes('stage only')));
			assert.ok(opts.some((o) => o.followUpQuery.includes('push')));
		});

		test('push-type clarification option follow-up query parses to an action intent', () => {
			const result = buildPlan({
				kind: 'ambiguous',
				action: 'ambiguous_add_to_branch',
				branch: 'frontend',
				targetFile: 'globals.css'
			}, repoFixture());

			const pushOpt = (result.clarificationOptions ?? []).find((o) => o.followUpQuery.includes('push'));
			assert.ok(pushOpt, 'expected a push-type clarification option');

			const followUpIntent = parseIntent(pushOpt.followUpQuery);
			assert.strictEqual(followUpIntent.kind, 'action');

			const followUpPlan = buildPlan(followUpIntent, repoFixture());
			assert.strictEqual(followUpPlan.kind, 'plan');
		});

		test('clarification option follow-up queries do not produce dangerous commands', () => {
			const result = buildPlan({
				kind: 'ambiguous',
				action: 'ambiguous_add_to_branch',
				branch: 'frontend',
				targetFile: 'globals.css'
			}, repoFixture());

			const dangerousFragments = ['reset --hard', 'push --force', 'clean -fd', 'rebase -i'];

			for (const opt of result.clarificationOptions ?? []) {
				const followUpPlan = buildPlan(parseIntent(opt.followUpQuery), repoFixture());

				for (const cmd of followUpPlan.commands) {
					assert.ok(
						!dangerousFragments.some((fragment) => cmd.command.includes(fragment)),
						`Option "${opt.label}" produced a dangerous command: ${cmd.command}`
					);
				}
			}
		});
	});

	suite('changed-file picker', () => {
		const twoGlobals = {
			changedFiles: [
				file('src/app/globals.css', 'M'),
				file('styles/globals.css', 'M')
			]
		};

		test('multiple file matches on push_branch produce a filePicker', () => {
			const result = buildPlan(
				{ kind: 'action', action: 'push_branch', branch: 'frontend', targetFile: 'globals.css' },
				repoFixture(twoGlobals)
			);

			assert.strictEqual(result.kind, 'clarification');
			assert.strictEqual(result.filePicker?.files.length, 2);
			assert.ok(result.filePicker!.files.some((f) => f.path === 'src/app/globals.css'));
			assert.ok(result.filePicker!.files.some((f) => f.path === 'styles/globals.css'));
		});

		test('multiple file matches on create_and_push_branch produce a filePicker', () => {
			const result = buildPlan(
				{ kind: 'action', action: 'create_and_push_branch', branch: 'feature', targetFile: 'globals.css' },
				repoFixture(twoGlobals)
			);

			assert.strictEqual(result.kind, 'clarification');
			assert.strictEqual(result.filePicker?.files.length, 2);
		});

		test('filePicker entries embed the exact file path in their follow-up query', () => {
			const result = buildPlan(
				{ kind: 'action', action: 'push_branch', branch: 'frontend', targetFile: 'globals.css' },
				repoFixture(twoGlobals)
			);

			for (const entry of result.filePicker?.files ?? []) {
				assert.ok(
					entry.followUpQuery.includes(entry.path),
					`Follow-up query "${entry.followUpQuery}" should contain path "${entry.path}"`
				);
			}
		});

		test('push_branch file picker follow-up queries resolve to specific file plans', () => {
			const result = buildPlan(
				{ kind: 'action', action: 'push_branch', branch: 'frontend', targetFile: 'globals.css' },
				repoFixture(twoGlobals)
			);

			for (const entry of result.filePicker?.files ?? []) {
				const followUpIntent = parseIntent(entry.followUpQuery);
				assert.strictEqual(followUpIntent.kind, 'action', `"${entry.followUpQuery}" should parse as action`);

				const followUpPlan = buildPlan(followUpIntent, repoFixture({ changedFiles: [file(entry.path, 'M')] }));
				assert.strictEqual(followUpPlan.kind, 'plan');
				assert.ok(
					followUpPlan.commands.some((c) => c.command.includes(entry.path)),
					`Plan should stage "${entry.path}"`
				);
			}
		});

		test('create_and_push_branch file picker follow-up queries resolve to specific file plans', () => {
			const result = buildPlan(
				{ kind: 'action', action: 'create_and_push_branch', branch: 'feature', targetFile: 'globals.css' },
				repoFixture(twoGlobals)
			);

			for (const entry of result.filePicker?.files ?? []) {
				const followUpIntent = parseIntent(entry.followUpQuery);
				assert.strictEqual(followUpIntent.kind, 'action', `"${entry.followUpQuery}" should parse as action`);

				const followUpPlan = buildPlan(followUpIntent, repoFixture({ changedFiles: [file(entry.path, 'M')] }));
				assert.strictEqual(followUpPlan.kind, 'plan');
				assert.ok(
					followUpPlan.commands.some((c) => c.command.includes(entry.path)),
					`Plan should reference "${entry.path}"`
				);
			}
		});

		test('single file match does not produce a filePicker', () => {
			const result = buildPlan(
				{ kind: 'action', action: 'push_branch', branch: 'frontend', targetFile: 'globals.css' },
				repoFixture()
			);

			assert.strictEqual(result.kind, 'plan');
			assert.strictEqual(result.filePicker, undefined);
		});

		test('file picker follow-up queries do not produce dangerous commands', () => {
			const result = buildPlan(
				{ kind: 'action', action: 'push_branch', branch: 'frontend', targetFile: 'globals.css' },
				repoFixture(twoGlobals)
			);

			const dangerousFragments = ['reset --hard', 'push --force', 'clean -fd', 'rebase -i'];

			for (const entry of result.filePicker?.files ?? []) {
				const followUpPlan = buildPlan(
					parseIntent(entry.followUpQuery),
					repoFixture({ changedFiles: [file(entry.path, 'M')] })
				);

				for (const cmd of followUpPlan.commands) {
					assert.ok(
						!dangerousFragments.some((fragment) => cmd.command.includes(fragment)),
						`File picker "${entry.path}" follow-up produced a dangerous command: ${cmd.command}`
					);
				}
			}
		});
	});

	suite('next-step suggestions', () => {
		const cases: Array<{ label: string; query: RepoQueryKind; overrides: Partial<RepoInspection>; mustInclude: string[] }> = [
			{
				label: 'staged_files with staged files returns commit and unstage options',
				query: 'staged_files',
				overrides: {},
				mustInclude: ['Commit staged files']
			},
			{
				label: 'staged_files with no staged files returns stage option',
				query: 'staged_files',
				overrides: {
					status: {
						staged: [],
						unstaged: [file('src/file.ts', 'M')],
						untracked: [],
						deleted: [],
						conflicted: []
					}
				},
				mustInclude: ['Stage a file']
			},
			{
				label: 'changed_files returns a stage option',
				query: 'changed_files',
				overrides: {},
				mustInclude: ['Stage a file']
			},
			{
				label: 'untracked_files returns a stage option',
				query: 'untracked_files',
				overrides: {},
				mustInclude: ['Stage a file']
			},
			{
				label: 'deleted_files with deleted files returns a commit option',
				query: 'deleted_files',
				overrides: {},
				mustInclude: ['Commit staged files']
			},
			{
				label: 'current_branch returns show-changed and push options',
				query: 'current_branch',
				overrides: {},
				mustInclude: ['Show what changed', 'Push to this branch']
			},
			{
				label: 'clean repo returns a safe fallback suggestion',
				query: 'changed_files',
				overrides: { changedFiles: [] },
				mustInclude: ['Show git status']
			}
		];

		for (const tc of cases) {
			test(tc.label, () => {
				const result = buildPlan(
					{ kind: 'query', action: 'repo_query', query: tc.query },
					repoFixture(tc.overrides)
				);

				const steps = result.repoAnswer?.suggestedNextSteps ?? [];

				for (const expected of tc.mustInclude) {
					assert.ok(
						steps.includes(expected),
						`Expected "${expected}" in next steps but got: [${steps.join(', ')}]`
					);
				}
			});
		}
	});

	suite('beginner wording', () => {
		test('unknown intent uses a beginner-friendly summary', () => {
			const result = buildPlan({ kind: 'unknown', action: 'unknown' }, repoFixture());
			assert.strictEqual(result.summary, "I'm not sure which Git action you want yet.");
		});

		test('ambiguous add uses a beginner-friendly summary', () => {
			const result = buildPlan({
				kind: 'ambiguous',
				action: 'ambiguous_add_to_branch',
				branch: 'frontend',
				targetFile: 'globals.css'
			}, repoFixture());
			assert.strictEqual(result.summary, 'This could mean more than one Git workflow.');
		});

		test('file picker clarification uses a beginner-friendly summary', () => {
			const result = buildPlan(
				{ kind: 'action', action: 'push_branch', branch: 'frontend', targetFile: 'globals.css' },
				repoFixture({
					changedFiles: [
						file('src/app/globals.css', 'M'),
						file('styles/globals.css', 'M')
					]
				})
			);
			assert.ok(
				!result.summary.toLowerCase().includes('need a clearer'),
				'Summary should not use jargony phrasing'
			);
			assert.ok(result.summary.length > 0);
		});
	});

	suite('edge cases', () => {
		test('detached HEAD state is mentioned in branch findings', () => {
			const result = buildPlan(
				{ kind: 'query', action: 'repo_query', query: 'current_branch' },
				repoFixture({
					branchState: { current: undefined, upstream: undefined, ahead: 0, behind: 0, isDetached: true },
					currentBranch: undefined
				})
			);

			assert.ok(
				result.repoAnswer?.whatIFound.some((line) => line.toLowerCase().includes('detached')),
				'Expected detached HEAD to be mentioned'
			);
		});

		test('branch with no upstream reports that no upstream was detected', () => {
			const result = buildPlan(
				{ kind: 'query', action: 'repo_query', query: 'current_branch' },
				repoFixture({
					branchState: { current: 'feature', upstream: undefined, ahead: 0, behind: 0, isDetached: false }
				})
			);

			assert.ok(
				result.repoAnswer?.whatIFound.some((line) => line.toLowerCase().includes('no upstream')),
				'Expected no-upstream message'
			);
		});

		test('commit_and_push_branch generates a commit with the provided message and a push', () => {
			const result = buildPlan({
				kind: 'action',
				action: 'commit_and_push_branch',
				branch: 'main',
				commitMessage: 'update readme'
			}, repoFixture());

			assert.strictEqual(result.kind, 'plan');
			assert.ok(commandTexts(result).some((c) => c.includes('git commit')));
			assert.ok(commandTexts(result).some((c) => c.includes('git push')));
			assert.ok(
				commandTexts(result).some((c) => c.includes('update readme')),
				'Expected commit message to appear in commit command'
			);
		});

		test('non-git repo with action request produces a safe result', () => {
			const result = buildPlan(
				{ kind: 'action', action: 'push_branch', branch: 'main' },
				nonGitRepoFixture()
			);

			assert.ok(['plan', 'clarification'].includes(result.kind));

			const dangerousFragments = ['reset --hard', 'push --force', 'clean -fd', 'rebase -i'];

			for (const cmd of result.commands) {
				assert.ok(
					!dangerousFragments.some((fragment) => cmd.command.includes(fragment)),
					`Non-git repo plan produced a dangerous command: ${cmd.command}`
				);
			}
		});

		test('clean repo next steps contain only one safe suggestion', () => {
			const result = buildPlan(
				{ kind: 'query', action: 'repo_query', query: 'changed_files' },
				repoFixture({ changedFiles: [] })
			);

			const steps = result.repoAnswer?.suggestedNextSteps ?? [];
			assert.ok(steps.length > 0, 'Expected at least one next-step suggestion');
			assert.ok(steps.includes('Show git status'));
		});
	});
});

function repoFixture(overrides: Partial<RepoInspection> = {}): RepoInspection {
	const changedFiles = overrides.changedFiles ?? [
		file('src/staged.ts', 'M'),
		file('src/unstaged.ts', 'M'),
		file('src/new.ts', '??'),
		file('src/deleted.ts', 'D'),
		file('src/conflicted.ts', 'UU'),
		file('src/styles/globals.css', 'M')
	];

	return {
		isGitRepo: true,
		rootPath: '/workspace',
		currentBranch: 'feature',
		branchState: {
			current: 'feature',
			upstream: 'origin/feature',
			ahead: 2,
			behind: 1,
			isDetached: false
		},
		changedFiles,
		status: {
			staged: [file('src/staged.ts', 'M')],
			unstaged: [file('src/unstaged.ts', 'M')],
			untracked: [file('src/new.ts', '??')],
			deleted: [file('src/deleted.ts', 'D')],
			conflicted: [file('src/conflicted.ts', 'UU')]
		},
		localBranches: ['feature', 'frontend', ...(overrides.localBranches ?? [])],
		remoteBranches: ['feature', 'frontend', ...(overrides.remoteBranches ?? [])],
		notes: ['Current branch appears to be "feature".'],
		warnings: [],
		...overrides
	};
}

function nonGitRepoFixture(): RepoInspection {
	return {
		isGitRepo: false,
		branchState: {
			ahead: 0,
			behind: 0,
			isDetached: false
		},
		changedFiles: [],
		status: {
			staged: [],
			unstaged: [],
			untracked: [],
			deleted: [],
			conflicted: []
		},
		localBranches: [],
		remoteBranches: [],
		notes: [],
		warnings: ['GitPal could not inspect this folder as a Git repository.']
	};
}

function file(path: string, status: string): ChangedFile {
	return { path, status };
}

function paths(files: ChangedFile[]): string[] {
	return files.map((changedFile) => changedFile.path);
}

function commandTexts(result: { commands: Array<{ command: string }> }): string[] {
	return result.commands.map((command) => command.command);
}
