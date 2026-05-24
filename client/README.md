# OpenBrief Client

This workspace contains OpenBrief's web, mobile, worker, and shared TypeScript packages. It is managed with pnpm workspaces and Turborepo.

## Workspace Layout

```text
apps/
  expo/             React Native app shell
  nextjs/           Next.js web app
  tanstack-start/   TanStack Start web app
  workers/          Worker entry points
packages/
  api/              Shared API routing
  auth/             Authentication integration
  db/               Database schema and access
  ui/               Shared UI components
  validators/       Shared validation helpers
tooling/
  eslint/           Shared ESLint config
  prettier/         Shared Prettier config
  tailwind/         Shared Tailwind config
  typescript/       Shared TypeScript config
```

## Setup

Install dependencies from this directory:

```bash
pnpm install
```

If pnpm reports ignored native build scripts on a fresh machine, run `pnpm approve-builds`, approve the listed native/tooling packages, then rerun `pnpm install`.

Copy the environment template before running apps that need local configuration:

```bash
cp .env.example .env
```

## Local Development

Use two terminals from this directory when working on the web app and desktop app together:

```bash
pnpm dev:next
```

The Next.js app runs at `http://localhost:3000`.

```bash
pnpm dev:tauri
```

The Tauri command builds the helper sidecar, starts the desktop renderer through Vite at `http://localhost:1420`, compiles the Rust app, and launches the desktop window.

## Common Commands

```bash
pnpm dev
pnpm dev:next
pnpm dev:tauri
pnpm typecheck
pnpm lint
pnpm build
pnpm format
```

Database and auth helpers are exposed from the root workspace scripts:

```bash
pnpm db:push
pnpm db:studio
pnpm auth:generate
```

Use `pnpm --filter <workspace> <script>` when running a command for a single app or package.
