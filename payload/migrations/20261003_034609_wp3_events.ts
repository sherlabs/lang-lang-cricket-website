import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_events_type" AS ENUM('one_time', 'recurring');
  CREATE TYPE "payload"."enum_events_day_of_week" AS ENUM('0', '1', '2', '3', '4', '5', '6');
  CREATE TYPE "payload"."enum_event_rsvps_response" AS ENUM('yes', 'no');
  CREATE TYPE "payload"."enum_event_photos_status" AS ENUM('approved', 'pending');
  CREATE TABLE "payload"."events_meal_options" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"type" "payload"."enum_events_type" DEFAULT 'one_time' NOT NULL,
  	"title" varchar NOT NULL,
  	"description" varchar DEFAULT '',
  	"location" varchar DEFAULT '',
  	"cover_id" integer,
  	"event_time" varchar DEFAULT '',
  	"event_date" timestamp(3) with time zone,
  	"day_of_week" "payload"."enum_events_day_of_week" DEFAULT '4',
  	"start_date" timestamp(3) with time zone,
  	"end_date" timestamp(3) with time zone,
  	"payment_link_label" varchar DEFAULT '',
  	"payment_link_url" varchar DEFAULT '',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."event_rsvps" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"event_id" integer NOT NULL,
  	"occurrence_date" timestamp(3) with time zone NOT NULL,
  	"name" varchar NOT NULL,
  	"email" varchar DEFAULT '',
  	"note" varchar DEFAULT '',
  	"response" "payload"."enum_event_rsvps_response" DEFAULT 'yes',
  	"meal" varchar DEFAULT '',
  	"edit_token" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."event_photos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"event_id" integer NOT NULL,
  	"caption" varchar DEFAULT '',
  	"sort_order" numeric,
  	"status" "payload"."enum_event_photos_status" DEFAULT 'approved',
  	"submitter_name" varchar DEFAULT '',
  	"legacy_url" varchar,
  	"prefix" varchar DEFAULT 'events',
  	"_objectkey" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "events_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "event_rsvps_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "event_photos_id" integer;
  ALTER TABLE "payload"."events_meal_options" ADD CONSTRAINT "events_meal_options_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."events" ADD CONSTRAINT "events_cover_id_media_id_fk" FOREIGN KEY ("cover_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."event_rsvps" ADD CONSTRAINT "event_rsvps_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "payload"."events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."event_photos" ADD CONSTRAINT "event_photos_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "payload"."events"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "events_meal_options_order_idx" ON "payload"."events_meal_options" USING btree ("_order");
  CREATE INDEX "events_meal_options_parent_id_idx" ON "payload"."events_meal_options" USING btree ("_parent_id");
  CREATE INDEX "events_cover_idx" ON "payload"."events" USING btree ("cover_id");
  CREATE INDEX "events_updated_at_idx" ON "payload"."events" USING btree ("updated_at");
  CREATE INDEX "events_created_at_idx" ON "payload"."events" USING btree ("created_at");
  CREATE INDEX "event_rsvps_event_idx" ON "payload"."event_rsvps" USING btree ("event_id");
  CREATE INDEX "event_rsvps_occurrence_date_idx" ON "payload"."event_rsvps" USING btree ("occurrence_date");
  CREATE INDEX "event_rsvps_response_idx" ON "payload"."event_rsvps" USING btree ("response");
  CREATE UNIQUE INDEX "event_rsvps_edit_token_idx" ON "payload"."event_rsvps" USING btree ("edit_token");
  CREATE INDEX "event_rsvps_updated_at_idx" ON "payload"."event_rsvps" USING btree ("updated_at");
  CREATE INDEX "event_rsvps_created_at_idx" ON "payload"."event_rsvps" USING btree ("created_at");
  CREATE INDEX "event_photos_event_idx" ON "payload"."event_photos" USING btree ("event_id");
  CREATE INDEX "event_photos_sort_order_idx" ON "payload"."event_photos" USING btree ("sort_order");
  CREATE INDEX "event_photos_status_idx" ON "payload"."event_photos" USING btree ("status");
  CREATE UNIQUE INDEX "event_photos_legacy_url_idx" ON "payload"."event_photos" USING btree ("legacy_url");
  CREATE INDEX "event_photos_updated_at_idx" ON "payload"."event_photos" USING btree ("updated_at");
  CREATE INDEX "event_photos_created_at_idx" ON "payload"."event_photos" USING btree ("created_at");
  CREATE UNIQUE INDEX "event_photos_filename_idx" ON "payload"."event_photos" USING btree ("filename");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_events_fk" FOREIGN KEY ("events_id") REFERENCES "payload"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_event_rsvps_fk" FOREIGN KEY ("event_rsvps_id") REFERENCES "payload"."event_rsvps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_event_photos_fk" FOREIGN KEY ("event_photos_id") REFERENCES "payload"."event_photos"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_events_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("events_id");
  CREATE INDEX "payload_locked_documents_rels_event_rsvps_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("event_rsvps_id");
  CREATE INDEX "payload_locked_documents_rels_event_photos_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("event_photos_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."events_meal_options" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."event_rsvps" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."event_photos" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."events_meal_options" CASCADE;
  DROP TABLE "payload"."events" CASCADE;
  DROP TABLE "payload"."event_rsvps" CASCADE;
  DROP TABLE "payload"."event_photos" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_events_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_event_rsvps_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_event_photos_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_events_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_event_rsvps_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_event_photos_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "events_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "event_rsvps_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "event_photos_id";
  DROP TYPE "payload"."enum_events_type";
  DROP TYPE "payload"."enum_events_day_of_week";
  DROP TYPE "payload"."enum_event_rsvps_response";
  DROP TYPE "payload"."enum_event_photos_status";`)
}
