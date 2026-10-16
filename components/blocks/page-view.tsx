import { PageHeader } from '@/components/page-header'
import { RenderBlocks } from '@/components/blocks/render-blocks'
import type { PageView as PageViewData } from '@/lib/domain'

/** One info page: a header band and its blocks. Shared by `/info/[slug]` and the staff preview. */
export function PageView({ page, eyebrow }: { page: PageViewData; eyebrow: string }) {
  return (
    <main>
      <PageHeader eyebrow={eyebrow} title={page.title} />
      <section className="container-site py-12 lg:py-16">
        {page.blocks.length > 0 ? <RenderBlocks blocks={page.blocks} /> : <p className="mx-auto max-w-2xl text-brand-grey">This page has no content yet.</p>}
      </section>
    </main>
  )
}
