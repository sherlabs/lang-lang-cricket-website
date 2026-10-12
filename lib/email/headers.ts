/** The headers every campaign message carries so mail programs can show an unsubscribe button (one click, RFC 8058). */
export function campaignHeaders(unsubscribeUrl: string): Record<string, string> {
  if (!/^https:\/\/|^http:\/\/localhost|^http:\/\/127\.0\.0\.1/.test(unsubscribeUrl) || /[<>\r\n\s]/.test(unsubscribeUrl)) throw new Error('Unsubscribe address is not usable')
  return { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
}

/** The public address of the unsubscribe page. Built from the configured site address only, never from a request header. */
export const unsubscribeUrl = (serverURL: string, token: string): string => `${serverURL.replace(/\/+$/, '')}/unsubscribe/${token}`
