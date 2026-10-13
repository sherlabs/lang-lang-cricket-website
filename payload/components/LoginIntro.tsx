// @committee-facing
import { emailEnabled } from '@/lib/email/env'

/**
 * `admin.components.beforeLogin` (wave G WP-0/WP-1): a short, meaningful line above Payload's sign-in form so the page is never an
 * empty card while the rest loads. The crest and the club's name come from the Logo graphic above it; this is static copy with no
 * data and no club name, so it renders instantly and is the same for every club. Facebook sign-in is for selectors only and is not
 * part of this page. The "Forgot your password?" link under the form exists only when outbound mail is configured (without it a
 * reset would have nowhere to go), so the help line says which of the two applies.
 */
export function LoginIntro({ resetByEmail = emailEnabled() }: { resetByEmail?: boolean } = {}) {
  return (
    <div className="club-login-intro" data-admin-login-intro data-login-reset={resetByEmail ? 'on' : 'off'}>
      <p className="club-login-intro__title">Sign in to look after the website</p>
      <p className="club-login-intro__text">News, fixtures, photos and sponsors, all in one place.</p>
      <p className="club-login-intro__help">
        {resetByEmail ? 'Forgotten your password? Use the link below the form.' : 'Forgotten your password? Ask the person who looks after the site to reset it.'}
      </p>
    </div>
  )
}
