import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_stories_status" AS ENUM('pending', 'published', 'rejected');
  CREATE TABLE "payload"."stories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar,
  	"excerpt" varchar DEFAULT '',
  	"content" jsonb NOT NULL,
  	"cover_image_id" integer,
  	"author_name" varchar NOT NULL,
  	"author_email" varchar DEFAULT '',
  	"status" "payload"."enum_stories_status" NOT NULL,
  	"submitted_by_admin" boolean DEFAULT false,
  	"published_at" timestamp(3) with time zone,
  	"reviewed_at" timestamp(3) with time zone,
  	"edit_token" varchar,
  	"view_token" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "stories_id" integer;
  ALTER TABLE "payload"."stories" ADD CONSTRAINT "stories_cover_image_id_media_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "stories_slug_idx" ON "payload"."stories" USING btree ("slug");
  CREATE INDEX "stories_cover_image_idx" ON "payload"."stories" USING btree ("cover_image_id");
  CREATE INDEX "stories_status_idx" ON "payload"."stories" USING btree ("status");
  CREATE UNIQUE INDEX "stories_edit_token_idx" ON "payload"."stories" USING btree ("edit_token");
  CREATE UNIQUE INDEX "stories_view_token_idx" ON "payload"."stories" USING btree ("view_token");
  CREATE INDEX "stories_updated_at_idx" ON "payload"."stories" USING btree ("updated_at");
  CREATE INDEX "stories_created_at_idx" ON "payload"."stories" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_stories_fk" FOREIGN KEY ("stories_id") REFERENCES "payload"."stories"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_stories_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("stories_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."stories" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."stories" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_stories_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_stories_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "stories_id";
  DROP TYPE "payload"."enum_stories_status";`)
}
