import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_yearbooks_status" AS ENUM('draft', 'published');
  CREATE TABLE "payload"."yearbooks" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"season_name" varchar NOT NULL,
  	"slug" varchar,
  	"status" "payload"."enum_yearbooks_status" DEFAULT 'draft' NOT NULL,
  	"published_at" timestamp(3) with time zone,
  	"cover_id" integer,
  	"premiership" varchar DEFAULT '',
  	"president_message" varchar DEFAULT '',
  	"coach_message" varchar DEFAULT '',
  	"sponsor_message" varchar DEFAULT '',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."yearbooks_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"gallery_photos_id" integer,
  	"sponsors_id" integer
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "yearbooks_id" integer;
  ALTER TABLE "payload"."club" ADD COLUMN "pages_yearbooks_title" varchar DEFAULT 'Season Yearbooks';
  ALTER TABLE "payload"."club" ADD COLUMN "pages_yearbooks_description" varchar DEFAULT 'Season-by-season yearbooks for Lang Lang Cricket Club: messages from the club, the stats leaders, results and photos.';
  ALTER TABLE "payload"."club" ADD COLUMN "pages_matches_title" varchar DEFAULT 'Match Archive';
  ALTER TABLE "payload"."club" ADD COLUMN "pages_matches_description" varchar DEFAULT 'Every finished Lang Lang Cricket Club match this season by grade, with results and links to the full scorecards.';
  ALTER TABLE "payload"."yearbooks" ADD CONSTRAINT "yearbooks_cover_id_media_id_fk" FOREIGN KEY ("cover_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."yearbooks_rels" ADD CONSTRAINT "yearbooks_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."yearbooks"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."yearbooks_rels" ADD CONSTRAINT "yearbooks_rels_gallery_photos_fk" FOREIGN KEY ("gallery_photos_id") REFERENCES "payload"."gallery_photos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."yearbooks_rels" ADD CONSTRAINT "yearbooks_rels_sponsors_fk" FOREIGN KEY ("sponsors_id") REFERENCES "payload"."sponsors"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "yearbooks_season_name_idx" ON "payload"."yearbooks" USING btree ("season_name");
  CREATE UNIQUE INDEX "yearbooks_slug_idx" ON "payload"."yearbooks" USING btree ("slug");
  CREATE INDEX "yearbooks_status_idx" ON "payload"."yearbooks" USING btree ("status");
  CREATE INDEX "yearbooks_cover_idx" ON "payload"."yearbooks" USING btree ("cover_id");
  CREATE INDEX "yearbooks_updated_at_idx" ON "payload"."yearbooks" USING btree ("updated_at");
  CREATE INDEX "yearbooks_created_at_idx" ON "payload"."yearbooks" USING btree ("created_at");
  CREATE INDEX "yearbooks_rels_order_idx" ON "payload"."yearbooks_rels" USING btree ("order");
  CREATE INDEX "yearbooks_rels_parent_idx" ON "payload"."yearbooks_rels" USING btree ("parent_id");
  CREATE INDEX "yearbooks_rels_path_idx" ON "payload"."yearbooks_rels" USING btree ("path");
  CREATE INDEX "yearbooks_rels_gallery_photos_id_idx" ON "payload"."yearbooks_rels" USING btree ("gallery_photos_id");
  CREATE INDEX "yearbooks_rels_sponsors_id_idx" ON "payload"."yearbooks_rels" USING btree ("sponsors_id");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_yearbooks_fk" FOREIGN KEY ("yearbooks_id") REFERENCES "payload"."yearbooks"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_yearbooks_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("yearbooks_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."yearbooks" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."yearbooks_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."yearbooks" CASCADE;
  DROP TABLE "payload"."yearbooks_rels" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_yearbooks_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_yearbooks_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "yearbooks_id";
  ALTER TABLE "payload"."club" DROP COLUMN "pages_yearbooks_title";
  ALTER TABLE "payload"."club" DROP COLUMN "pages_yearbooks_description";
  ALTER TABLE "payload"."club" DROP COLUMN "pages_matches_title";
  ALTER TABLE "payload"."club" DROP COLUMN "pages_matches_description";
  DROP TYPE "payload"."enum_yearbooks_status";`)
}
