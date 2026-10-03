import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "payload"."documents_legacy_url_idx";
  DROP INDEX "payload"."gallery_photos_legacy_url_idx";
  CREATE INDEX "documents_legacy_url_idx" ON "payload"."documents" USING btree ("legacy_url");
  CREATE INDEX "gallery_photos_legacy_url_idx" ON "payload"."gallery_photos" USING btree ("legacy_url");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "payload"."documents_legacy_url_idx";
  DROP INDEX "payload"."gallery_photos_legacy_url_idx";
  CREATE UNIQUE INDEX "documents_legacy_url_idx" ON "payload"."documents" USING btree ("legacy_url");
  CREATE UNIQUE INDEX "gallery_photos_legacy_url_idx" ON "payload"."gallery_photos" USING btree ("legacy_url");`)
}
