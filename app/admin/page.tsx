import Link from 'next/link'

export default function AdminDashboard() {
  return (
    <main>
      <h1 className="mb-4 text-2xl font-semibold">Lang Lang CC — Admin</h1>
      <p className="text-sm text-gray-600">
        Manage <Link href="/admin/documents" className="underline">documents</Link>,{' '}
        <Link href="/admin/gallery" className="underline">gallery</Link>,{' '}
        <Link href="/admin/sponsors" className="underline">sponsors</Link>,{' '}
        <Link href="/admin/contacts" className="underline">contacts</Link>, and{' '}
        <Link href="/admin/playhq" className="underline">PlayHQ data</Link>.
      </p>
    </main>
  )
}
