# Repository Guidelines

## Read This First
Do not duplicate product or architecture rules in code comments or PR descriptions. Use these as the source of truth:
- `specs/PRODUCT_SPEC.md`
- `specs/ARCHITECTURE.md`
- `specs/DECISIONS.md`

## Project Structure
- `modules/shared/src/accumulator.ts`: shared deterministic accumulator implementation.
- `modules/accumulator/scripts/build-accumulator.ts`: build entrypoint.
- `modules/shared/test/accumulator.test.ts`: shared accumulator test suite.
- `modules/foundry/`: flat Foundry module (`RecoveryVerifier.sol`, `RecoveryVerifier.t.sol`, `DeployRecoveryVerifier.s.sol`, `foundry.toml`).
- `modules/web/`: Vite UI app.
- `data/transfers.json`: versioned input snapshot.
- `data/accumulator.json`: generated artifact (ignored by git).

## Build, Test, and Typecheck
- `bun run build:merkle`: rebuild `data/accumulator.json` from `data/transfers.json`.
- `bun run sol:build`: compile Solidity contracts with Foundry.
- `bun run sol:test`: run Solidity tests.
- `bun run sol:deploy:sepolia`: deploy verifier using Foundry (requires `MERKLE_ROOT`, `SEPOLIA_RPC_URL`, and `PRIVATE_KEY`).
- `bun run ui:typecheck`: run frontend TypeScript checks.
- `bun run ui:test`: run frontend tests.
- `bun run ui:build`: build the frontend artifact.
- `bun run format`: apply Biome formatting to source and config files.
- `bun run format:check`: verify formatting without writing changes.
- `bun run lint`: run Biome lint checks on `modules/accumulator`, `modules/shared`, and `modules/web`.
- `bun test`: run tests.
- `bun run typecheck`: run TypeScript checks.
- `bun run qa`: run formatting check, lint, typecheck, and tests.

Before opening a PR, run:
1. `bun run qa`
2. `bun run build:merkle`
3. `bun run ui:typecheck`
4. `bun run ui:test`

## Coding Conventions
- TypeScript, ES modules, strict mode.
- 2-space indentation.
- Keep deterministic logic in `modules/shared/src/`; keep I/O at script boundaries.
- Name tests `*.test.ts` and keep names aligned with module names.

## Pull Requests
- Use short, imperative commit subjects.
- Keep PRs focused.
- Include command results (`qa`, `build:merkle`).
- If behavior changes, update the relevant file in `specs/` instead of duplicating rules elsewhere.
