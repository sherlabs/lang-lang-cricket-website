# Deployment model

**One deployment per club, from this repository, single tenant.** This is a recommendation for the owner to confirm; nothing else depends on a different answer.

Each club has:

- its own copy of the repository (a fork or a "use as template" copy that keeps an `upstream` remote),
- its own Vercel project, Postgres database, Blob store, domain, cron schedules and email sender.

The only shared service is the **sign-in broker** (one Meta app for every club, so no club needs its own Facebook app review). See [broker registration](./broker-registration.md).

## Why not multi-tenant

- Club data (members, fees, availability PINs, selections) is personal and financial. A separate database per club is the simplest correct isolation: a single bug cannot leak one club's members into another.
- The PlayHQ organisation and credentials, cookie prefix, locale, timezone and season calendar are all per club.
- A multi-tenant plugin would touch access control in every collection.
- A separate free-tier project costs a club nothing extra.

## What stays the same in every copy

Everything outside `clubs/<slug>/` is identical to upstream. A club never edits those files; see [upstream updates](./upstream-updates.md).
