// @committee-facing
import { LinkButton } from './ui/Button'

/**
 * Calm full-page messages for the two cases where a custom admin view must not redirect (wave G WP-0): a signed-in person who is not
 * on the committee (a redirect to the login page would loop, because the login page sends signed-in people straight back), and a
 * sign-in check that failed (a redirect would be a false "you are signed out"). Plain server markup, no client script, no data, and
 * nothing about the person's role beyond what the selector link already implies.
 */
export function NoAccessNotice({ signOutHref, selectorHref }: { signOutHref: string; selectorHref: string | null }) {
  return (
    <main className="club-notice" data-admin-notice="no-access">
      <h1 className="club-notice__title">This part of the admin is for the committee.</h1>
      <p className="club-notice__text">If you think you should be able to open it, ask the person who looks after the site.</p>
      <p className="club-notice__actions">
        {selectorHref !== null && <LinkButton href={selectorHref}>Go to the selector area</LinkButton>}
        <LinkButton href={signOutHref} variant={selectorHref !== null ? 'secondary' : 'primary'}>Sign out</LinkButton>
      </p>
    </main>
  )
}

export function AuthTroubleNotice({ reloadHref, signInHref }: { reloadHref: string; signInHref: string }) {
  return (
    <main className="club-notice" data-admin-notice="auth-trouble" role="alert">
      <h1 className="club-notice__title">We could not check that you are signed in.</h1>
      <p className="club-notice__text">This is usually a short hiccup. Reload the page, or sign in again.</p>
      <p className="club-notice__actions">
        <LinkButton href={reloadHref}>Reload</LinkButton>
        <LinkButton href={signInHref} variant="secondary">Sign in</LinkButton>
      </p>
    </main>
  )
}
