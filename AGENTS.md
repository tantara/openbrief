# AGENTS.md

## Scope

These instructions apply to the entire OpenBrief repository.

## Project Shape

OpenBrief is a Tauri v2 desktop app with a React/TypeScript renderer and a Rust trusted boundary. The app manages local video, audio, and PDF imports, yt-dlp downloads, transcription, markdown summaries, chat, playlists, and artifact export.

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

## Self-Contained Library Structure

- Treat each imported asset directory as a portable bundle that can be zipped and imported on another device.
- Store per-asset artifacts under `./{videos,audios,pdfs}/{id}/...`, where `.` is the app library root or the root of an exported bundle.
- Keep the source media, transcript, transcript variants, summaries, chat sessions, generated TTS audio, thumbnails/previews, metadata, and bundle manifest inside the corresponding asset directory.
- Do not add new top-level per-asset artifact buckets such as `transcripts/`, `summaries/`, `thumbnails/`, or global TTS `generations/`. Shared indexes, playlists, model checkpoints, and job-temp/cache data may live outside the asset bundle.
- Store artifact references in manifests as library-relative paths so moving or zipping `videos/{id}`, `audios/{id}`, or `pdfs/{id}` preserves the artifact graph.
- Path helpers should be media-type aware. Avoid hard-coding `videos/{id}` for artifacts that can belong to audio or PDF assets.

## Validation

Run the smallest useful checks first, then widen as needed:

- `cd tauri && pnpm test:run <pattern>` for focused frontend/domain/service tests.
- `cd tauri && pnpm typecheck` for TypeScript changes.
- `cd tauri && pnpm build` when app bundling or Vite integration may be affected.
- `cd tauri/src-tauri && cargo test` or `cargo check` for Rust changes.
- `git diff --check` before reporting completion.

## Commits

- Create a git commit after a new feature is implemented and verified.
- If unrelated files are already present in tracked changes, treat them as parallel work and include those tracked changes in the commit instead of ignoring, reverting, or resetting them.
- Keep external reference repos and research folders out of commits unless the user explicitly asks to vendor them.
- Use the repository Lore commit protocol: an intent-first subject plus decision trailers for constraints, rejected alternatives, confidence, scope risk, directives, and verification evidence.
