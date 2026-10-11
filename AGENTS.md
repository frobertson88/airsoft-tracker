# AGENTS.md

## Goal

Build the app incrementally with simple, maintainable solutions.

Prefer working software over speculative architecture.

## Working Rules

Before making changes:

1. Read this file.
2. Read `plans/current.md`.
3. Read only the docs and source files relevant to the current task.
4. Search for existing patterns before creating new ones.

While implementing:

- Stay within the scope in `current.md`.
- Prefer the smallest solution that satisfies the requirements.
- Reuse existing components and patterns.
- Do not implement future features early.
- Do not refactor unrelated code.
- Avoid abstractions until there is a demonstrated need.
- Keep UI components focused and reusable.
- Keep business/game logic separate from UI where practical.

## Architecture

`docs/architecture.md` is the source of truth for application architecture.

Feature behaviour belongs in the relevant file under `docs/`.

Do not change architecture purely for convenience.

If the current task requires a significant architectural change:

- stop before implementing it;
- explain the proposed change and why it is needed.

## Planning

For small/local changes:

- inspect;
- implement;
- test.

For larger changes:

- create a short implementation plan first;
- identify affected areas;
- implement in small steps.

Do not create elaborate plans for simple tasks.

## Context / Token Efficiency

Keep context focused.

- Do not read every file in `docs/`.
- Do not scan the entire repository unless necessary.
- Do not repeatedly reread unchanged files.
- Prefer targeted searches.
- Do not use subagents for straightforward work.
- Use subagents only when independent investigation can materially reduce the main task.

## Testing

After changes:

- Run relevant tests.
- Run lint/type checks when applicable.
- Fix failures caused by the change.
- Do not fix unrelated failures unless requested.

Add tests for important behaviour and game logic.

## Completion

Before finishing:

- Verify the requirements in `plans/current.md`.
- Check that the app still builds/runs where practical.
- Summarize what changed.
- Mention any unresolved issues or decisions.

Do not automatically begin the next feature.
