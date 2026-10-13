# Registering the site in the sign-in broker

Selectors can sign in with Facebook. To avoid every club needing its own Meta app (and its own app review), clubs share one **sign-in broker**. The broker holds the single Meta app; each club site redirects the visitor to the broker, which sends back a short signed assertion that the site verifies with the broker's public keys.

## What the broker operator needs from you

A `CLUBS` entry for your site. `pnpm bootstrap:club` prints it for your profile:

```
"<club-id>": {
  "origins": ["https://your-site.example"],
  "returnPath": "/selector/facebook/broker-callback",
  "eventsPath": "/api/websport-auth/events"
}
```

- `origins` are the exact site origins allowed to start a sign-in (add a preview origin only if you need to test there).
- `returnPath` is where the broker sends the visitor back. It must match exactly; it is fixed in `config/site.ts`.
- `eventsPath` is where the broker posts Facebook's data-deletion and deauthorize events. It is also fixed in `config/site.ts`.

## What you set on the host

- `AUTH_BROKER_ORIGIN`: the broker's origin (`https://...`, no path).
- `AUTH_BROKER_CLUB_ID`: the id you were given in the `CLUBS` list (lowercase letters, digits and dashes).

Then choose the mode in the admin under Site settings, Sign-in. While either variable is empty Facebook sign-in through the broker is off and the button is hidden. A club that prefers its own Meta app sets `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` instead.

Sign-in never creates accounts: a selector is invited by the committee first and links Facebook afterwards.
