import { AdminNav } from '@/components/admin/admin-nav'

export default function AdminShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-brand-stone text-brand-black">
      <AdminNav />
      <div className="container-site flex-1 py-10 sm:py-12">{children}</div>
    </div>
  )
}
