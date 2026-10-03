# Lang Lang Cricket Club site (Payload CMS 3 + Next 16)

Public site and committee admin for a community cricket club. Branch `feat/payload-cms`; it is not merged to `main` until the production cutover (see `docs/superpowers/plans/2026-10-03-payload-cutover-checklist.md`). Visual system: `DESIGN.md`. Specs: `docs/superpowers/specs/`. Feature docs: `docs/features/`.

## Stack and layout

- Next 16 (App Router, React 19), Payload 3 with Postgres (`payload` schema), Tailwind, Vercel Blob for files, PlayHQ public API for fixtures and stats.
- `app/(frontend)` public pages, `app/(payload)` admin, `payload/` collections, globals, hooks, admin views and scripts, `lib/` queries and pure logic (`lib/*-queries.ts` is the only data layer pages use), `tests/` (unit) and `tests/int/` (integration).
- Individuals (committee, coaches) come only from `lib/people-queries.ts` and `components/person-card.tsx`; never type a person into a global.

## Commands

- `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm tsc --noEmit`
- `pnpm test` (unit, no DB), `pnpm test:int` (needs local Postgres), single file: `pnpm vitest run tests/<file>`
- `pnpm generate` then `pnpm check:generated` (regenerates `payload-types.ts` and the admin import map; both are committed)
- `pnpm payload migrate:create <name>` for schema changes, `pnpm check:migrations` to replay them on `langlang_mig`
- Scripts: `pnpm seed:admin|seed:club|seed:demo|etl|verify:cutover|export:since --target <host>/<db> [--confirm]`

## Safety rules (hard)

- `.env.local` is LOCAL ONLY: Postgres on `127.0.0.1:54329` (`langlang_dev`, `langlang_test`, `langlang_mig`, `langlang_legacy`). Never put a production database URL or a Blob token in it. Never `vercel env pull` into this checkout. Never read the main checkout's `.env.local` or run the Vercel CLI against production.
- Guards: `assertSafeEnv()` in `payload/env.ts` refuses remote DBs and Blob tokens off Vercel; every `payload run` script uses `payload/scripts/_guard.ts` (`--target` must equal `DATABASE_URI`, `--confirm` to write, `ALLOW_REMOTE_DB=yes` for remote). Do not weaken or bypass them.
- Never push or merge to `main` without being asked. Dev servers use ports 3400-3499.

## Schema and generated files

- Any collection or global change needs a migration (`pnpm payload migrate:create`), schema-qualified; commit the `.ts` and `.json`. Then `pnpm generate`, `pnpm check:migrations`, `pnpm check:generated` must pass after `git add`.
- Payload push hangs without a TTY: reset the dev DB with `DROP SCHEMA payload CASCADE` or run the migrations.

## Committee admin classification rule

The admin is deliberately simple (`payload/admin/navigation.ts`, `visibility.ts`; `tests/admin-visibility.test.ts` forces every collection and global to be classified). A new collection or global needs `admin.group: false`, plain-English labels and helper text, and an entry in `everydayNav` (committee) or `advancedNav` (admin only, with `admin.hidden: hiddenFromEditors`). Never weaken access control to make a form easier.

## Feature documentation rule (required)

Every user-facing feature or behaviour change must add or update `docs/features/<slug>.mdx` in the same PR (frontmatter + Persona, Why it was built, What it does, How to use it, Not included/deferred) and the index (`docs/features/index.mdx`); a PR that ships a feature without its doc is incomplete. `tests/feature-docs.test.ts` enforces the shape. Describe only what is built, verified against the code, and link deferred items to their GitHub issue (tracking issue #38).

## Conventions

- Conventional commits (`feat(scope):`, `fix:`, `docs:`), explicit paths with `git add` (never `git add -A`).
- Iterate with targeted checks (tsc, one vitest file, eslint on changed files); run the full suite and one `next build` once at the end.
- Public queries must state their own visibility filter (published, not hidden, approved) because the Local API ignores access rules.
