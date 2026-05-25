# OpenBrief Video Skills

This directory mirrors the coding-agent `SKILL.md` pattern for OpenBrief's native
video generation agent.

Each skill folder has:

- `manifest.json` — machine-readable metadata that must match the pinned
  TypeScript catalog under `src/domain/video-component-catalog.ts`.
- `SKILL.md` — compact LLM-facing guidance for when and how to request the
  component.

The app should trust the TypeScript catalog and validators, not the prose skill
file. The skill files are prompt context for the right-side AI agent.

The editor agent only returns validated JSON plans. It cannot invoke shell, Deno,
npm, or arbitrary filesystem/network actions. Rendering remains a separate
trusted-helper boundary owned by Tauri and the video-generation helper protocol.
