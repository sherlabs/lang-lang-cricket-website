'use client'

import { useConfig, useDocumentInfo, useFormFields } from '@payloadcms/ui'

/**
 * `members.fields.removeDetails` (ui, admin only): a link from the native edit page to the confirmation box on the directory, where
 * the removal is confirmed, done and audited. Hidden on a new member and once the details have been removed.
 */
export function MemberRemoveDetailsField() {
  const { id } = useDocumentInfo()
  const { config } = useConfig()
  const erased = useFormFields(([fields]) => Boolean(fields.erasedAt?.value))
  if (!id || erased) return null
  return (
    <div className="field-type">
      <p>Remove this person&rsquo;s email, phone, address, date of birth, emergency contact and notes for good.</p>
      <a className="btn btn--style-secondary btn--size-medium" href={`${config.routes.admin}/office/members?erase=${id}`}>
        Remove personal details
      </a>
    </div>
  )
}
