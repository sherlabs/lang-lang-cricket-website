import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."club" ADD COLUMN "favicon_id" integer;
  ALTER TABLE "payload"."club" ADD COLUMN "hero_image_id" integer;
  ALTER TABLE "payload"."club" ADD CONSTRAINT "club_favicon_id_media_id_fk" FOREIGN KEY ("favicon_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."club" ADD CONSTRAINT "club_hero_image_id_media_id_fk" FOREIGN KEY ("hero_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "club_favicon_idx" ON "payload"."club" USING btree ("favicon_id");
  CREATE INDEX "club_hero_image_idx" ON "payload"."club" USING btree ("hero_image_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."club" DROP CONSTRAINT "club_favicon_id_media_id_fk";
  
  ALTER TABLE "payload"."club" DROP CONSTRAINT "club_hero_image_id_media_id_fk";
  
  DROP INDEX "payload"."club_favicon_idx";
  DROP INDEX "payload"."club_hero_image_idx";
  ALTER TABLE "payload"."club" DROP COLUMN "favicon_id";
  ALTER TABLE "payload"."club" DROP COLUMN "hero_image_id";`)
}
