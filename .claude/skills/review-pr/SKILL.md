---
name: review-pr
description: Code review a pull request
argument-hint: <pr-number-or-url>
allowed-tools: [Bash, Read, Glob, Grep, Agent]
---

Code review the pull request specified by the user: $ARGUMENTS

Follow these steps precisely:

## Step 1: Eligibility Check

Use a Haiku agent to check if the pull request (a) is closed, (b) is a draft, (c) does not need a code review (e.g., automated PR, trivial change like a version bump), or (d) already has a code review comment from Claude. If any of these are true, report the reason and stop.

## Step 2: Gather CLAUDE.md Files

Use a Haiku agent to list file paths (not contents) of all relevant CLAUDE.md files: the root CLAUDE.md, and any CLAUDE.md files in directories whose files the PR modified. Return the list of paths.

## Step 3: Summarize the PR

Use a Haiku agent to view the pull request diff via `gh pr diff` and return a concise summary of what changed and why.

## Step 4: Parallel Code Review

Launch 5 parallel Sonnet agents to independently review the change. Provide each agent with the PR diff, change summary from Step 3, and CLAUDE.md paths from Step 2. Each agent returns a list of issues with the reason each was flagged.

### Agent 1: CLAUDE.md Compliance

Read the CLAUDE.md files and audit the PR changes for compliance. Key areas for this project:

- Layered architecture: routes must not call repositories directly (Routes -> Services -> Repositories)
- Services are plain modules, not classes
- All imports use `.js` extensions (NodeNext resolution)
- Custom error classes must be used — never throw plain `Error` in services
- Zod validation schemas defined inline in route files
- Middleware ordering (Stripe webhook before express.json)
- TypeScript strict mode conventions: no `any`, prefer `interface` over `type` for object shapes
- File naming: kebab-case, classes PascalCase, functions/variables camelCase, constants SCREAMING_SNAKE_CASE
- Async route handlers use try/catch with `next(error)`

Note: CLAUDE.md is guidance for Claude as it writes code, so not all instructions are applicable during code review.

### Agent 2: Bug Scan

Read the file changes in the PR diff. Do a shallow scan for obvious bugs. Focus just on the changes themselves, not surrounding code. Target significant bugs only — avoid nitpicks. Ignore likely false positives.

### Agent 3: Git History Context

Read the git blame and history of the modified code to identify any bugs in light of that historical context. Check if changes revert previous intentional fixes or introduce regressions.

### Agent 4: Previous PR Comments

Read previous pull requests that touched these files and check for any review comments that may also apply to the current PR.

### Agent 5: Code Comment Compliance

Read code comments in the modified files and verify the PR changes comply with any guidance in those comments (TODOs, warnings, invariants, etc.).

## Step 5: Confidence Scoring

For each issue found in Step 4, launch a parallel Haiku agent that takes the PR, issue description, and list of CLAUDE.md file paths (from Step 2). The agent scores the issue on a scale of 0-100. Give this rubric to each agent verbatim:

- **0**: Not confident at all. False positive that doesn't stand up to light scrutiny, or a pre-existing issue.
- **25**: Somewhat confident. Might be real, but may be a false positive. Could not verify it's a real issue. If stylistic, not explicitly called out in CLAUDE.md.
- **50**: Moderately confident. Verified as a real issue, but may be a nitpick or rare in practice. Not very important relative to the rest of the PR.
- **75**: Highly confident. Double checked and verified as very likely a real issue that will be hit in practice. The existing PR approach is insufficient. Directly impacts functionality, or is directly mentioned in CLAUDE.md.
- **100**: Absolutely certain. Double checked and confirmed as definitely a real issue, frequent in practice. Evidence directly confirms this.

For issues flagged due to CLAUDE.md, the agent must double check that the CLAUDE.md actually calls out that issue specifically.

## Step 6: Filter

Filter out any issues with a score less than 80. If no issues meet this threshold, proceed to Step 8 with the "no issues" format.

## Step 7: Re-check Eligibility

Use a Haiku agent to repeat the eligibility check from Step 1 to make sure the PR is still eligible for review (not closed or updated since review started).

## Step 8: Post Comment

Use `gh pr comment` to post the review. Follow this format precisely:

### If issues were found:

```
### Code review

Found N issues:

1. <brief description of issue> (CLAUDE.md says "<relevant quote>")

<link to file and line — must use full git SHA + line range, e.g. https://github.com/Dynasty-Futures/DF-Backend/blob/abc123.../src/file.ts#L10-L15>

2. <brief description of issue> (bug due to <file and code snippet>)

<link to file and line with full SHA + line range>

Generated with [Claude Code](https://claude.ai/code)

<sub>- If this code review was useful, please react with a thumbs up. Otherwise, react with a thumbs down.</sub>
```

### If no issues were found:

```
### Code review

No issues found. Checked for bugs and CLAUDE.md compliance.

Generated with [Claude Code](https://claude.ai/code)
```

## Link Format

When linking to code, follow this format precisely — otherwise GitHub Markdown won't render correctly:

```
https://github.com/Dynasty-Futures/DF-Backend/blob/<full-40-char-sha>/path/to/file.ts#L10-L15
```

- Requires full git SHA (not abbreviated, not a shell command like `$(git rev-parse HEAD)`)
- `#` sign after the file name
- Line range format: `L<start>-L<end>`
- Provide at least 1 line of context before and after the issue line

## Important Notes

- Use `gh` for all GitHub interactions — do not use web fetch
- Make a todo list first to track progress
- Cite and link each issue (if referring to a CLAUDE.md, link it)
- Keep the final comment brief and direct
- Do not run builds, typechecks, or linters — assume CI handles those separately

## False Positive Guidance

These are NOT real issues — filter them out in Steps 4 and 5:

- Pre-existing issues not introduced by this PR
- Something that looks like a bug but is not actually a bug
- Pedantic nitpicks a senior engineer wouldn't flag
- Issues a linter, typechecker, or compiler would catch (imports, type errors, formatting)
- General code quality (test coverage, documentation) unless explicitly required in CLAUDE.md
- Issues called out in CLAUDE.md but explicitly silenced in code (e.g., lint ignore comments)
- Intentional functionality changes related to the broader change
- Real issues on lines not modified in this PR
- Trading platform provider interface changes that are intentionally swappable
- Hybrid live/stored data pattern variations that are by design
- Service module structure changes that maintain the namespace export pattern
