import { WHITE } from '@/lib/theme/neutral'
import { escapeHtml, renderParagraphsHtml, renderPlain, type MergeContext } from './merge'

/** Colours and font for a message, taken from the resolved theme by the caller (no colour literal lives here). */
export type MailBrand = { band: string; text: string; muted: string; link: string; surface: string; font: string }

export type FooterInput = { template: string; unsubscribeText: string; complianceText: string; clubName: string; contact: string }

/** Footer sentences from the office settings. `{clubName}` and `{contact}` are the only tags. */
export function footerLines(f: FooterInput): string[] {
  const reason = f.template.replace(/\{clubName\}/g, f.clubName).replace(/\{contact\}/g, f.contact).replace(/\s+/g, ' ').trim()
  return [reason, f.unsubscribeText.trim(), f.complianceText.trim()].filter(Boolean)
}

const shell = (brand: MailBrand, clubName: string, inner: string, footerHtml: string): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(clubName)}</title></head>
<body style="margin:0;padding:0;background:${brand.surface};color:${brand.text};font-family:${brand.font};font-size:16px;line-height:1.5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${brand.surface}"><tr><td align="center" style="padding:16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${WHITE}">
<tr><td style="background:${brand.band};color:${WHITE};padding:16px 24px;font-size:20px;font-weight:bold">${escapeHtml(clubName)}</td></tr>
<tr><td style="padding:24px">${inner}</td></tr>
${footerHtml ? `<tr><td style="padding:16px 24px;border-top:1px solid ${brand.surface};color:${brand.muted};font-size:13px">${footerHtml}</td></tr>` : ''}
</table></td></tr></table></body></html>`

export type RenderedMail = { subject: string; html: string; text: string }

/** A campaign message: the committee's text, then the sender identification, the reason and the unsubscribe link. Plain text always included. */
export function renderCampaign(input: { subject: string; body: string; ctx: MergeContext; brand: MailBrand; footer: string[]; unsubscribeUrl: string }): RenderedMail {
  const { brand, ctx } = input
  const bodyHtml = renderParagraphsHtml(input.body, ctx, `color:${brand.link}`)
  const footerHtml = [...input.footer.map((l) => `<p style="margin:0 0 8px">${escapeHtml(l)}</p>`), `<p style="margin:0"><a href="${escapeHtml(input.unsubscribeUrl)}" style="color:${brand.link}">Unsubscribe</a></p>`].join('')
  const text = `${renderPlain(input.body, ctx)}\n\n--\n${input.footer.join('\n')}\nUnsubscribe: ${input.unsubscribeUrl}\n`
  return { subject: renderPlain(input.subject, ctx).replace(/\s+/g, ' '), html: shell(brand, ctx.clubName, bodyHtml, footerHtml), text }
}

/** A transactional message (password reset, invites): the club's look, no marketing footer and no unsubscribe link. */
export function renderTransactional(input: { clubName: string; brand: MailBrand; paragraphs: string[]; action?: { label: string; url: string } }): { html: string; text: string } {
  const { brand } = input
  const paras = input.paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`).join('')
  const button = input.action ? `<p style="margin:0 0 16px"><a href="${escapeHtml(input.action.url)}" style="display:inline-block;background:${brand.band};color:${WHITE};padding:12px 20px;text-decoration:none;font-weight:bold">${escapeHtml(input.action.label)}</a></p><p style="margin:0 0 16px;font-size:13px;color:${brand.muted}">${escapeHtml(input.action.url)}</p>` : ''
  const text = [...input.paragraphs, ...(input.action ? [`${input.action.label}: ${input.action.url}`] : [])].join('\n\n')
  return { html: shell(brand, input.clubName, paras + button, ''), text: `${text}\n` }
}
