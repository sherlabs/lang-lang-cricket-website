import type { UIFieldServerProps } from 'payload'
import { CLUB_LOCALE, CLUB_TIMEZONE, BROKER_EVENTS_PATH, selectorPaths } from '@/config/site'
import { brokerConfig, brokerRegistration, parseBrokerConfig } from '@/lib/signin/broker'
import { computeSignIn } from '@/lib/signin/mode'
import { getClub } from '@/lib/club'
import { readSignInState } from '@/lib/signin/state'
import { facebookConfig } from '@/lib/facebook-login'
import { isAdminUser } from '../admin/visibility'
import { SignInTestButton } from './SignInTestButton'
import { StatusPill } from './ui'

const when = new Intl.DateTimeFormat(CLUB_LOCALE, { timeZone: CLUB_TIMEZONE, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
const SET = (v: boolean) => (v ? 'set' : 'not set')

/**
 * The status block inside Site settings > Sign-in (admin only): what Facebook sign-in is doing right now and why, which server
 * settings are present (yes or no, never their values), what to register at the broker or at Meta, the trust model, and Test
 * connection. Server component: it reads the saved mode, so a mode chosen in the form shows here after Save.
 */
export async function SignInPanel({ payload, user }: UIFieldServerProps) {
  if (!isAdminUser(user as never)) return null
  const state = await readSignInState(payload)
  const env = process.env
  const origin = payload.config.serverURL.replace(/\/+$/, '')
  const mode = computeSignIn({ stored: state.mode, env, serverURL: origin })
  const broker = brokerConfig(env)
  const club = await getClub()
  const brokerProblem = parseBrokerConfig(env).reason
  const status =
    mode.kind === 'broker' ? 'Facebook sign-in is on through the shared broker.'
    : mode.kind === 'own-app' ? `Facebook sign-in is on through the club's own Facebook app${mode.reason ? ' (the shared broker is not set up here)' : ''}.`
    : `Off: ${mode.reason ?? 'Facebook sign-in is switched off.'}${mode.reason?.endsWith('.') ? '' : '.'}`
  return (
    <section className="club-signin" aria-label="Facebook sign-in status">
      <h3 className="club-field__title">Status</h3>
      <p>
        <StatusPill tone={mode.kind === 'off' ? 'neutral' : 'ok'}>{mode.kind === 'off' ? 'Off' : 'On'}</StatusPill> {status}
      </p>
      <p className="club-muted">Changes to the choice above apply after you press Save. Password sign-in always keeps working.</p>

      <h3 className="club-field__title">Settings on the server</h3>
      <ul className="club-signin__list">
        <li>AUTH_BROKER_ORIGIN and AUTH_BROKER_CLUB_ID (shared broker): {SET(Boolean(broker))}{!broker && brokerProblem ? ` (${brokerProblem})` : ''}</li>
        <li>FACEBOOK_APP_ID and FACEBOOK_APP_SECRET (the club&apos;s own app): {SET(Boolean(facebookConfig(env)))}</li>
      </ul>

      <h3 className="club-field__title">Through the shared broker</h3>
      <p className="club-muted">Ask the broker&apos;s operator to add this club with these values, and to give you the broker address and the club id.</p>
      <pre className="club-signin__pre" tabIndex={0}>{JSON.stringify(brokerRegistration(broker, origin, club.name), null, 2)}</pre>
      <p className="club-muted">
        <strong>Who is trusted.</strong> In this mode the club trusts the shared broker to say which Facebook person is signing in. A compromised broker could sign in as any selector who has linked Facebook through it. The risk is small on purpose: only selectors can be signed in this way (never an editor or an admin), only people who were invited are linked (nothing is created from Facebook alone), and a selector can only reach the selector area. If the club does not accept this, choose its own Facebook app or turn Facebook off.
      </p>
      <SignInTestButton />
      {state.lastTest.at && (
        <p className="club-muted">
          Last check {when.format(new Date(state.lastTest.at))}: <StatusPill tone={state.lastTest.ok ? 'ok' : 'danger'}>{state.lastTest.ok ? 'OK' : 'Problem'}</StatusPill> {state.lastTest.summary}
        </p>
      )}

      <h3 className="club-field__title">Through the club&apos;s own Facebook app</h3>
      <p className="club-muted">In the Meta developer console, for the Facebook Login product, use:</p>
      <ul className="club-signin__list">
        <li>Valid OAuth redirect URI: <code>{origin}{selectorPaths.facebookCallback}</code></li>
        <li>Data deletion callback URL: <code>{origin}{selectorPaths.facebookDataDeletion}</code></li>
        <li>Deauthorize callback URL: <code>{origin}{selectorPaths.facebookDeauthorize}</code></li>
      </ul>
      <p className="club-muted">Also turn on Web OAuth login and strict mode for redirect URIs, and add a public privacy policy page. The app id and secret go in the server settings, never in this form.</p>
      <p className="club-muted">Events from the shared broker arrive at <code>{origin}{BROKER_EVENTS_PATH}</code>.</p>
      {state.lastEvent.at && state.lastEvent.unlinked > 0 && <p className="club-muted">Last broker event: {state.lastEvent.unlinked} selector{state.lastEvent.unlinked === 1 ? '' : 's'} unlinked, {when.format(new Date(state.lastEvent.at))}.</p>}
    </section>
  )
}
