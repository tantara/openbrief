# AGENTS.md

## Scope

These instructions apply to the entire OpenClip repository.

## Project Shape

OpenClip is a Tauri v2 desktop app with a React/TypeScript renderer and a Rust trusted boundary. The app manages local video imports, yt-dlp downloads, transcription, markdown summaries, chat, playlists, and artifact export.

## Worktree Rules

- Expect a dirty worktree. Do not revert or overwrite changes you did not make.
- Keep external reference repos and research folders out of commits unless the user explicitly asks to vendor them.
- Prefer small, behavior-preserving diffs. Delete dead code before adding new abstractions.

## Architecture Rules

- Keep pure domain logic in `tauri/src/domain`.
- Keep side effects in `tauri/src/services`, `tauri/src/hooks`, or Rust commands.
- Keep feature UI under `tauri/src/features`; share reusable controls through `tauri/src/components`.
- Prefer shadcn UI components and accessible controls for renderer UI.
- User-visible renderer strings should go through i18n.
- Rust owns authority for credentials, filesystem paths, sidecar execution, provider secret resolution, and app-library roots.
- Renderer code must not receive raw provider secrets or authority-bearing filesystem roots.
- Helper subprocess execution must use argv arrays, not shell-concatenated commands.

## Validation

Run the smallest useful checks first, then widen as needed:

- `cd tauri && pnpm test:run <pattern>` for focused frontend/domain/service tests.
- `cd tauri && pnpm typecheck` for TypeScript changes.
- `cd tauri && pnpm build` when app bundling or Vite integration may be affected.
- `cd tauri/src-tauri && cargo test` or `cargo check` for Rust changes.
- `git diff --check` before reporting completion.

## Commits

When asked to commit, use the repository Lore commit protocol: an intent-first subject plus decision trailers for constraints, rejected alternatives, confidence, scope risk, directives, and verification evidence.
