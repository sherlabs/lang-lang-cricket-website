/**
 * Creates the first admin from INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD.
 *   pnpm seed:admin --target 127.0.0.1/langlang_dev --confirm
 * Passes context.seedAdmin, the only way past the users beforeOperation guard
 * when nobody is logged in (first-register is closed structurally, spec §3.1).
 */
import config from '@payload-config'
import { getPayload } from 'payload'
import { guard } from './_guard'

async function main() {
  await guard({ write: true })
  const email = process.env.INITIAL_ADMIN_EMAIL
  const password = process.env.INITIAL_ADMIN_PASSWORD
  if (!email || !password) throw new Error('INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD are required')

  const payload = await getPayload({ config })
  const existing = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, depth: 0 })
  if (existing.docs.length) {
    console.log(`[seed-admin] ${email} already exists (id ${existing.docs[0].id}); nothing to do`)
  } else {
    const user = await payload.create({
      collection: 'users',
      data: { email, password, role: 'admin', name: 'Admin' },
      context: { seedAdmin: true, disableRevalidate: true },
    })
    console.log(`[seed-admin] created admin ${user.email} (id ${user.id})`)
  }
  await payload.destroy()
}

// Top-level await: `payload run` exits as soon as the import resolves.
try {
  await main()
} catch (err) {
  console.error(err)
  process.exit(1)
}
