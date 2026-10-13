import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import Loading from '@/app/(payload)/admin/[[...segments]]/loading'
import { LoginIntro } from '@/payload/components/LoginIntro'

describe('admin first paint', () => {
  it('the loading skeleton renders with no data and carries the marker the streaming check looks for', () => {
    const html = renderToStaticMarkup(Loading())
    expect(html).toContain('data-admin-skeleton="shell"')
    expect(html).toContain('role="status"')
    expect(html).not.toMatch(/#[0-9a-f]{3,6}\b/i) // colours come from the --brand-* variables, never a literal
  })

  it('the login intro is static copy: no data, no club name', () => {
    const html = renderToStaticMarkup(LoginIntro())
    expect(html).toContain('Committee sign-in')
    expect(html).not.toMatch(/Lang Lang/i)
  })
})
