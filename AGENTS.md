# Hearth

Read [CONTEXT.md](CONTEXT.md) for the domain language and `docs/` for the design
before changing code.

## Toolchain

- Node is the version in `.node-version`; pnpm is the version in `packageManager`.
  Never use npm, npx or yarn; use `pnpm dlx` for a one-off tool.
- Add or remove a dependency with `pnpm add` / `pnpm remove` in the package that
  imports it, and commit `pnpm-lock.yaml`.
- Before handing off: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
  `pnpm test`, `pnpm build`.

## Versions

- Installed versions may be newer than your training data. Check an API against
  the package in `node_modules` before using it.
- Do not change Node, pnpm, or a dependency's major version unless asked.

## Writing

- `docs/` is written in Chinese; README, comments and everything else in English.
- Write a comment or a doc line only when the code cannot say it.
- This file is the only agent instruction file; `CLAUDE.md` imports it.
