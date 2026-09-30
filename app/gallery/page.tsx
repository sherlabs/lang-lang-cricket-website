import { asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { galleryPhotos } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { baseOpenGraph, canonicalFor } from "@/lib/site-metadata";
import { GalleryGrid } from "@/components/gallery-grid";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  // Newest upload as the share image, so a shared link shows something current.
  const [latest] = await db
    .select()
    .from(galleryPhotos)
    .orderBy(desc(galleryPhotos.createdAt))
    .limit(1);
  return {
    alternates: canonicalFor("/gallery"),
    title: "Gallery | Lang Lang Cricket Club",
    description:
      "Photos from match days, presentations and club life at Lang Lang Cricket Club in Caldermeade, Victoria.",
    openGraph: latest
      ? {
          ...baseOpenGraph,
          images: [
            {
              url: latest.url,
              alt: latest.caption || "Lang Lang Cricket Club gallery photo",
            },
          ],
        }
      : baseOpenGraph,
  };
}

export default async function GalleryPage() {
  const photos = await db
    .select()
    .from(galleryPhotos)
    .orderBy(asc(galleryPhotos.sortOrder));
  return (
    <main>
      <PageHeader
        eyebrow="Gallery"
        title="Around the club"
        intro="Match days, training nights and the people who make Lang Lang what it is. Tap any photo to view it full size."
      />
      <section className="container-site py-16 lg:py-20">
        <div className="mb-8 flex items-center gap-3">
          <span className="display text-2xl text-brand-black">Photos</span>
          <span className="rounded-full bg-brand-gold-pale px-2.5 py-0.5 text-xs font-semibold tabular-nums text-brand-gold-deep">
            {photos.length}
          </span>
          <span className="h-px flex-1 bg-brand-black/10" aria-hidden />
        </div>
        <GalleryGrid
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
