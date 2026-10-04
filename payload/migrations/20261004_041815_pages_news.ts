import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_pages_blocks_image_width" AS ENUM('narrow', 'wide', 'full');
  CREATE TYPE "payload"."enum_pages_blocks_cta_style" AS ENUM('primary', 'outline');
  CREATE TYPE "payload"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum_pages_show_in_navigation" AS ENUM('none', 'clubhouse', 'primary', 'footer');
  CREATE TYPE "payload"."enum_news_status" AS ENUM('draft', 'published');
  CREATE TABLE "payload"."pages_blocks_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"rich_text" jsonb NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_image" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer NOT NULL,
  	"alt" varchar NOT NULL,
  	"caption" varchar DEFAULT '',
  	"width" "payload"."enum_pages_blocks_image_width" DEFAULT 'wide' NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_cta" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"url" varchar NOT NULL,
  	"style" "payload"."enum_pages_blocks_cta_style" DEFAULT 'primary' NOT NULL,
  	"note" varchar DEFAULT '',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar,
  	"status" "payload"."enum_pages_status" DEFAULT 'draft' NOT NULL,
  	"published_at" timestamp(3) with time zone,
  	"show_in_navigation" "payload"."enum_pages_show_in_navigation" DEFAULT 'clubhouse' NOT NULL,
  	"nav_label" varchar DEFAULT '',
  	"nav_order" numeric DEFAULT 100,
  	"seo_title" varchar DEFAULT '',
  	"seo_description" varchar DEFAULT '',
  	"og_image_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."news" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar,
  	"status" "payload"."enum_news_status" DEFAULT 'draft' NOT NULL,
  	"published_at" timestamp(3) with time zone,
  	"cover_id" integer,
  	"excerpt" varchar DEFAULT '',
  	"body" jsonb NOT NULL,
  	"author" varchar DEFAULT '',
  	"seo_title" varchar DEFAULT '',
  	"seo_description" varchar DEFAULT '',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "pages_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "news_id" integer;
  ALTER TABLE "payload"."club" ADD COLUMN "pages_news_title" varchar;
  ALTER TABLE "payload"."club" ADD COLUMN "pages_news_description" varchar;
  ALTER TABLE "payload"."pages_blocks_text" ADD CONSTRAINT "pages_blocks_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_image" ADD CONSTRAINT "pages_blocks_image_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_image" ADD CONSTRAINT "pages_blocks_image_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_cta" ADD CONSTRAINT "pages_blocks_cta_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages" ADD CONSTRAINT "pages_og_image_id_media_id_fk" FOREIGN KEY ("og_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."news" ADD CONSTRAINT "news_cover_id_media_id_fk" FOREIGN KEY ("cover_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "pages_blocks_text_order_idx" ON "payload"."pages_blocks_text" USING btree ("_order");
  CREATE INDEX "pages_blocks_text_parent_id_idx" ON "payload"."pages_blocks_text" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_text_path_idx" ON "payload"."pages_blocks_text" USING btree ("_path");
  CREATE INDEX "pages_blocks_image_order_idx" ON "payload"."pages_blocks_image" USING btree ("_order");
  CREATE INDEX "pages_blocks_image_parent_id_idx" ON "payload"."pages_blocks_image" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_image_path_idx" ON "payload"."pages_blocks_image" USING btree ("_path");
  CREATE INDEX "pages_blocks_image_image_idx" ON "payload"."pages_blocks_image" USING btree ("image_id");
  CREATE INDEX "pages_blocks_cta_order_idx" ON "payload"."pages_blocks_cta" USING btree ("_order");
  CREATE INDEX "pages_blocks_cta_parent_id_idx" ON "payload"."pages_blocks_cta" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_cta_path_idx" ON "payload"."pages_blocks_cta" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_slug_idx" ON "payload"."pages" USING btree ("slug");
  CREATE INDEX "pages_status_idx" ON "payload"."pages" USING btree ("status");
  CREATE INDEX "pages_og_image_idx" ON "payload"."pages" USING btree ("og_image_id");
  CREATE INDEX "pages_updated_at_idx" ON "payload"."pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "payload"."pages" USING btree ("created_at");
  CREATE UNIQUE INDEX "news_slug_idx" ON "payload"."news" USING btree ("slug");
  CREATE INDEX "news_status_idx" ON "payload"."news" USING btree ("status");
  CREATE INDEX "news_published_at_idx" ON "payload"."news" USING btree ("published_at");
  CREATE INDEX "news_cover_idx" ON "payload"."news" USING btree ("cover_id");
  CREATE INDEX "news_updated_at_idx" ON "payload"."news" USING btree ("updated_at");
  CREATE INDEX "news_created_at_idx" ON "payload"."news" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_news_fk" FOREIGN KEY ("news_id") REFERENCES "payload"."news"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("pages_id");
  CREATE INDEX "payload_locked_documents_rels_news_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("news_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."pages_blocks_text" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_image" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_cta" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."news" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."pages_blocks_text" CASCADE;
  DROP TABLE "payload"."pages_blocks_image" CASCADE;
  DROP TABLE "payload"."pages_blocks_cta" CASCADE;
  DROP TABLE "payload"."pages" CASCADE;
  DROP TABLE "payload"."news" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_pages_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_news_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_pages_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_news_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "pages_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "news_id";
  ALTER TABLE "payload"."club" DROP COLUMN "pages_news_title";
  ALTER TABLE "payload"."club" DROP COLUMN "pages_news_description";
  DROP TYPE "payload"."enum_pages_blocks_image_width";
  DROP TYPE "payload"."enum_pages_blocks_cta_style";
  DROP TYPE "payload"."enum_pages_status";
  DROP TYPE "payload"."enum_pages_show_in_navigation";
  DROP TYPE "payload"."enum_news_status";`)
}
