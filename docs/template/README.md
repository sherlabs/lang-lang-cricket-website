# Club website template

This repository is a complete website and committee admin for a community cricket club. Lang Lang Cricket Club runs it in production, and the same code stands up a new club from a **profile file** and some environment variables, with no code edits ([#37](https://github.com/sherlabs/lang-lang-cricket-website/issues/37), tracking issue [#38](https://github.com/sherlabs/lang-lang-cricket-website/issues/38)).

## The three steps

1. **Describe the club.** Copy `clubs/example-fc/` to `clubs/<your-slug>/`, replace every value in `profile.json` ([field reference](./club-profile.md)) and drop your crest, hero picture, share image and favicon into `assets/`.
2. **Set up the host.** Create the Vercel project, Postgres database and Blob store, then set the environment variables from the [new club checklist](./new-club-checklist.md). `pnpm check:template` tells you what is still missing.
3. **Bootstrap and check.** `pnpm bootstrap:club --profile clubs/<slug>/profile.json --target <host>/<db>` is a dry run that prints exactly what it would do; add `--confirm` to apply it. Then sign in, look at Club details and Site look, and walk the smoke checklist.

## What is in this folder

| File | What it is for |
| --- | --- |
| [new-club-checklist.md](./new-club-checklist.md) | The ordered checklist, with the table of every environment variable. |
| [club-profile.md](./club-profile.md) | Every field of `profile.json` and what the validator checks. |
| [deployment-model.md](./deployment-model.md) | One deployment per club, and why. |
| [upstream-updates.md](./upstream-updates.md) | How a club picks up fixes and features later. |
| [broker-registration.md](./broker-registration.md) | Registering the site in the shared Facebook sign-in broker. |
| [copy-audit.md](./copy-audit.md) | Where Lang Lang words and files still appear in this repository, and why that is fine. |

## What the template does and does not do

It gives a new club the same public site, stats, committee admin, selector area and fantasy game, with neutral wording ("Your Cricket Club" until the profile is applied), colours derived from one accent colour, and its own name everywhere a visitor reads one. It does not give a club a PlayHQ account, a domain, an email sender or a place in the sign-in broker: those are the club's to supply (see the checklist). The Lang Lang copy lives in one preset file that Lang Lang's own deployment selects with `CLUB_PRESET=lang-lang`.
