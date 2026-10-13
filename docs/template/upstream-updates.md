# Upstream updates

A club's copy of the repository keeps an `upstream` remote so fixes and features arrive as a plain merge.

```
git remote add upstream <url of the template repository>
git fetch upstream --tags
git merge template-vX.Y        # or: git rebase template-vX.Y
```

## The rules

- **A club never edits files outside `clubs/<slug>/`.** Everything club specific is the profile, the assets and environment variables, so there is nothing to conflict with. If you find yourself wanting a code change, open an issue upstream instead.
- The only files that can conflict are `clubs/<slug>/` (yours alone) and `README.md`.
- Upstream tags releases `template-vX.Y` with a changelog. Read the release notes before merging: they list new environment variables (compare with `pnpm check:template`) and new migrations.
- Migrations are append-only and run during the build (`vercel-build` runs `payload migrate` against `DATABASE_URI_UNPOOLED`). Never edit or delete a migration file. Never reorder them.
- After merging run `pnpm check:template`, `pnpm test` and a preview deploy before promoting.

## When a merge conflicts

Take upstream's version of anything outside `clubs/<slug>/`, keep yours inside it, then re-run the checks above.
