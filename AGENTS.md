# Repository Guidelines

## Read This First
Do not duplicate product or architecture rules in code comments or PR descriptions. Use these as the source of truth:
- `specs/PRODUCT_SPEC.md`
- `specs/ARCHITECTURE.md`
- `specs/DECISIONS.md`

## Project Structure
- `src/accumulator.ts`: accumulator implementation.
- `scripts/build-accumulator.ts`: build entrypoint.
- `test/accumulator.test.ts`: test suite.
- `data/transfers.json`: versioned input snapshot.
- `data/accumulator.json`: generated artifact (ignored by git).

## Build, Test, and Typecheck
- `bun run build:merkle`: rebuild `data/accumulator.json` from `data/transfers.json`.
- `bun run format`: apply Biome formatting to source and config files.
- `bun run format:check`: verify formatting without writing changes.
- `bun run lint`: run Biome lint checks on `scripts/`, `src/`, and `test/`.
- `bun test`: run tests.
- `bun run typecheck`: run TypeScript checks.
- `bun run qa`: run formatting check, lint, typecheck, and tests.

Before opening a PR, run:
1. `bun run qa`
2. `bun run build:merkle`

## Coding Conventions
- TypeScript, ES modules, strict mode.
- 2-space indentation.
- Keep deterministic logic in `src/`; keep I/O at script boundaries.
- Name tests `*.test.ts` and keep names aligned with module names.

## Pull Requests
- Use short, imperative commit subjects.
- Keep PRs focused.
- Include command results (`qa`, `build:merkle`).
- If behavior changes, update the relevant file in `specs/` instead of duplicating rules elsewhere.
