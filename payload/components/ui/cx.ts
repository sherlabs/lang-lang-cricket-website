/** Join class names, dropping the empty ones. */
export const cx = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(' ')
