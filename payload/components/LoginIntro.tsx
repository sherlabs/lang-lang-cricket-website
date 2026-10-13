/**
 * `admin.components.beforeLogin` (wave G WP-0): a short, meaningful line above Payload's sign-in form so the page is never an empty
 * card while the rest loads. Static copy with no data and no club name, so it renders instantly and is the same for every club.
 */
export function LoginIntro() {
  return (
    <div className="club-login-intro" data-admin-login-intro>
      <p className="club-login-intro__title">Committee sign-in</p>
      <p className="club-login-intro__text">Sign in to look after the website: news, fixtures, photos and sponsors.</p>
    </div>
  )
}
