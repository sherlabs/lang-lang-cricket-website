/** What a selector form action hands back to its form. */
/** `secret` is a value shown once and not stored in the clear (a one-time code); the form shows it large with a Copy button. */
export type FormState = { error?: string; ok?: string; secret?: string }
