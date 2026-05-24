# OpenBrief

Turn videos and audio into clear, listenable briefings.

OpenBrief is a pnpm/Turborepo workspace centered on a Tauri v2 desktop app. It supports importing local media or video URLs, downloading media through bundled tools, transcribing audio, generating grounded summaries, chatting with media context, organizing playlists, and exporting reusable notes.

## Repository Layout

```text
client/
  apps/
    tauri/            Main OpenBrief desktop app
      src/            React renderer, feature UI, domain logic, services, hooks, i18n
      src-tauri/      Tauri v2 Rust boundary, commands, helper sidecar, packaging
      scripts/        Helper-sidecar and media-tool preparation scripts
    nextjs/           Web app and download/YouTube routes
    tanstack-start/   TanStack Start app shell
    expo/             React Native app shell
    workers/          Worker entry points
  packages/
    api/              Shared API routing
    auth/             Authentication integration
    db/               Database schema and access
    ui/               Shared UI components
    validators/       Shared validation helpers
  tooling/
    eslint/           Shared ESLint config
    github/           GitHub setup helpers
    prettier/         Shared Prettier config
    tailwind/         Shared Tailwind config
    typescript/       Shared TypeScript config

.github/              Issue templates and release/smoke workflows
AGENTS.md             Repository development guidance
DESIGN.md             Product and UI direction
```

The root may also contain local reference repos, research folders, generated build output, and runtime state such as `.omx/`, `external-research/`, `opencode/`, `OpenCut/`, `voicebox/`, or similar directories. Treat those as local/reference material unless a task explicitly says otherwise.

## Requirements

- Node.js `^22.21.0`
- pnpm `11.0.9`
- Rust and Cargo
- Tauri v2 platform prerequisites for your OS

Use the package manager declared in `client/package.json`.

## Setup

Install dependencies from the workspace root:

```bash
cd client
pnpm install
```

If pnpm reports ignored native build scripts on a fresh machine, run `pnpm approve-builds`, approve the listed native/tooling packages, then rerun `pnpm install`.

Create local environment values when needed:

```bash
cp .env.example .env
```

## Local Development

Use two terminals from `client/` when working on both the web app and desktop app:

```bash
pnpm dev:next
```

The Next.js app runs at `http://localhost:3000`.

```bash
pnpm dev:tauri
```

The Tauri dev command builds the helper sidecar, starts the desktop renderer through Vite at `http://localhost:1420`, compiles the Rust app, and launches the desktop window.

## Desktop App

Run the Tauri desktop app:

```bash
cd client
pnpm dev:tauri
```

Run only the renderer during frontend work:

```bash
cd client/apps/tauri
pnpm dev
```

Build frontend assets:

```bash
cd client/apps/tauri
pnpm build
```

Build or refresh bundled helper/media assets:

```bash
cd client/apps/tauri
pnpm setup:dev-sidecars
pnpm prepare:media-assets
```

Useful desktop checks:

```bash
cd client/apps/tauri
pnpm test:run
pnpm typecheck
cd src-tauri && cargo check
```

## Web And Shared Workspace

Run the Next.js app:

```bash
cd client
pnpm dev:next
```

Run all workspace dev tasks through Turbo:

```bash
cd client
pnpm dev
```

Common workspace checks:

```bash
cd client
pnpm typecheck
pnpm lint
pnpm build
```

Database and auth helpers:

```bash
cd client
pnpm db:push
pnpm db:studio
pnpm auth:generate
```

Use `pnpm --filter <workspace> <script>` or `pnpm -F <workspace> <script>` for a single app or package.

## Roadmap

- Improve audio file support for transcription, summaries, playback, and exports.
- Support more document and web source types, including PDFs, HTML pages, and other document formats.
- Support additional ASR models, including Parakeet and Qwen3-ASR.
- Support local LLMs, including Gemma 4.
- Add voice cloning so summaries can be read aloud in a selected voice.
- Share summaries through the web and mobile apps.
- Support more artifact formats, including flashcards and other reusable study or publishing outputs.

## Development Notes

- Keep pure desktop domain logic in `client/apps/tauri/src/domain`.
- Keep renderer side effects in `client/apps/tauri/src/services`, `client/apps/tauri/src/hooks`, or Rust commands.
- Keep feature UI in `client/apps/tauri/src/features` and shared controls in `client/apps/tauri/src/components`.
- Share cross-app UI through `client/packages/ui` when it is not desktop-specific.
- User-visible renderer strings should go through `client/apps/tauri/src/i18n`.
- Rust owns credentials, filesystem paths, sidecar execution, provider secret resolution, and app-library roots.
- Helper subprocess execution should use argv arrays, not shell-concatenated commands.

## Acknowledgements

OpenBrief builds on and takes inspiration from several projects:

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) for video download support.
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp) and [transcribe-rs](https://github.com/cjpais/transcribe-rs) for local speech-to-text.
- [tweakcn](https://tweakcn.com/themes/cmlhfpjhw000004l4f4ax3m7z) for the shadcn theme.
- [Voicebox](https://github.com/jamiepine/voicebox) and [Anarlog](https://github.com/fastrepl/anarlog) for product and implementation inspiration.

## License

OpenBrief is licensed under the [GNU Affero General Public License v3.0](LICENSE).

## Verification

Run the smallest check that proves the change, then widen as needed:

```bash
cd client/apps/tauri && pnpm test:run <pattern>
cd client/apps/tauri && pnpm typecheck
cd client/apps/tauri/src-tauri && cargo check
cd client && pnpm --filter @acme/nextjs typecheck
git diff --check
```

For packaging, run the relevant Tauri build on the target platform before making release claims.
