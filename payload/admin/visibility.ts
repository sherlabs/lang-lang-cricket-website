/**
 * Role-based visibility for the admin UI (spec: 2026-10-03-simple-admin-design.md).
 *
 * UI ONLY. Nothing here changes who may read or write data: that is `payload/access`.
 * Two roles exist (`users.role`): `editor` (the committee) sees a small, plain-English
 * admin; `admin` (the person who looks after the site) sees everything.
 */
// Payload hands `admin.hidden`/`condition` a client user (index signature), so keep this loose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Payload's ClientUser has an `any` index signature
type MaybeUser = { [key: string]: any } | null | undefined

export const isAdminUser = (user: MaybeUser): boolean => user?.role === 'admin'

/** `admin.hidden` for a collection/global: editors (and anyone not an admin) cannot open it. */
export const hiddenFromEditors = ({ user }: { user: MaybeUser }): boolean => !isAdminUser(user)

/**
 * `admin.condition` for a field: shown to admins only. Editors never see (or submit) it, and
 * the server keeps the stored value. Pass an extra rule to combine, e.g. only on edit.
 */
export const adminOnlyCondition =
  (extra?: (data: Record<string, unknown>, siblingData: Record<string, unknown>) => boolean) =>
  (data: Record<string, unknown>, siblingData: Record<string, unknown>, ctx?: { user?: MaybeUser }): boolean =>
    isAdminUser(ctx?.user) && (extra ? extra(data, siblingData) : true)
