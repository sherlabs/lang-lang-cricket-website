import { PageHeader } from "@/components/page-header";
import { baseOpenGraph, canonicalFor, pageSeo } from "@/lib/site-metadata";
import { GalleryGrid } from "@/components/gallery-grid";
import { getClub } from "@/lib/club";
import { getGalleryOgPhoto, listGalleryPhotos } from "@/lib/content-queries";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  // Newest upload as the share image, so a shared link shows something current.
  const [club, latest] = await Promise.all([getClub(), getGalleryOgPhoto()]);
  return {
    alternates: canonicalFor("/gallery"),
    ...pageSeo(club, "gallery"),
    openGraph: latest
      ? {
          ...baseOpenGraph(club),
          images: [
            {
              url: latest.url,
              alt: latest.caption || `${club.name}${club.pageCopy.gallery.ogImageAltSuffix}`,
            },
          ],
        }
      : baseOpenGraph(club),
  };
}

export default async function GalleryPage() {
  const [club, photos] = await Promise.all([getClub(), listGalleryPhotos()]);
  const copy = club.pageCopy.gallery;
  return (
    <main>
      <PageHeader eyebrow={copy.header.eyebrow} title={copy.header.title} intro={copy.header.intro} />
      <section className="container-site py-16 lg:py-20">
        <div className="mb-8 flex items-center gap-3">
          <span className="display text-2xl text-brand-black">{copy.photosLabel}</span>
          <span className="rounded-full bg-brand-gold-pale px-2.5 py-0.5 text-xs font-semibold tabular-nums text-brand-gold-deep">
            {photos.length}
          </span>
          <span className="h-px flex-1 bg-brand-black/10" aria-hidden />
        </div>
        <GalleryGrid
          altFallback={club.name}
          photos={photos.map((p) => ({
            id: p.id,
            url: p.url,
            caption: p.caption,
          }))}
        />
      </section>
    </main>
  );
}
