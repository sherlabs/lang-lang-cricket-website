import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_social_posts_status" AS ENUM('draft', 'scheduled', 'publishing', 'published', 'failed');
  CREATE TYPE "payload"."enum_social_post_targets_network" AS ENUM('facebook', 'instagram', 'x', 'mock');
  CREATE TYPE "payload"."enum_social_post_targets_size" AS ENUM('square', 'story', 'landscape');
  CREATE TYPE "payload"."enum_social_post_targets_status" AS ENUM('pending', 'publishing', 'published', 'failed', 'unknown');
  CREATE TABLE "payload"."social_posts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"status" "payload"."enum_social_posts_status" DEFAULT 'draft' NOT NULL,
  	"spec" jsonb NOT NULL,
  	"caption" varchar,
  	"hashtags" jsonb,
  	"scheduled_for" timestamp(3) with time zone,
  	"next_run_at" timestamp(3) with time zone,
  	"approved_by_id" integer,
  	"approved_at" timestamp(3) with time zone,
  	"created_by_id" integer,
  	"claim_token" varchar,
  	"claimed_at" timestamp(3) with time zone,
  	"finished_at" timestamp(3) with time zone,
  	"revision" numeric DEFAULT 1 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."social_post_targets" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"post_id" integer NOT NULL,
  	"network" "payload"."enum_social_post_targets_network" NOT NULL,
  	"size" "payload"."enum_social_post_targets_size" NOT NULL,
  	"final_text" varchar,
  	"status" "payload"."enum_social_post_targets_status" DEFAULT 'pending' NOT NULL,
  	"attempts" numeric DEFAULT 0 NOT NULL,
  	"next_attempt_at" timestamp(3) with time zone,
  	"last_error" varchar,
  	"error_code" varchar,
  	"remote_id" varchar,
  	"remote_url" varchar,
  	"published_at" timestamp(3) with time zone,
  	"manual" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "social_posts_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "social_post_targets_id" integer;
  ALTER TABLE "payload"."social_settings" ADD COLUMN "publish_window_earliest" varchar DEFAULT '07:00';
  ALTER TABLE "payload"."social_settings" ADD COLUMN "publish_window_latest" varchar DEFAULT '21:00';
  ALTER TABLE "payload"."social_settings" ADD COLUMN "last_cron_run_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."social_settings" ADD COLUMN "observed_cron_interval_minutes" numeric;
  ALTER TABLE "payload"."social_posts" ADD CONSTRAINT "social_posts_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."social_posts" ADD CONSTRAINT "social_posts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."social_post_targets" ADD CONSTRAINT "social_post_targets_post_id_social_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "payload"."social_posts"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "social_posts_approved_by_idx" ON "payload"."social_posts" USING btree ("approved_by_id");
  CREATE INDEX "social_posts_created_by_idx" ON "payload"."social_posts" USING btree ("created_by_id");
  CREATE INDEX "social_posts_updated_at_idx" ON "payload"."social_posts" USING btree ("updated_at");
  CREATE INDEX "social_posts_created_at_idx" ON "payload"."social_posts" USING btree ("created_at");
  CREATE INDEX "status_nextRunAt_idx" ON "payload"."social_posts" USING btree ("status","next_run_at");
  CREATE INDEX "createdBy_idx" ON "payload"."social_posts" USING btree ("created_by_id");
  CREATE INDEX "social_post_targets_post_idx" ON "payload"."social_post_targets" USING btree ("post_id");
  CREATE INDEX "social_post_targets_updated_at_idx" ON "payload"."social_post_targets" USING btree ("updated_at");
  CREATE INDEX "social_post_targets_created_at_idx" ON "payload"."social_post_targets" USING btree ("created_at");
  CREATE INDEX "post_idx" ON "payload"."social_post_targets" USING btree ("post_id");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_social_posts_fk" FOREIGN KEY ("social_posts_id") REFERENCES "payload"."social_posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_social_post_targets_fk" FOREIGN KEY ("social_post_targets_id") REFERENCES "payload"."social_post_targets"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_social_posts_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("social_posts_id");
  CREATE INDEX "payload_locked_documents_rels_social_post_targets_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("social_post_targets_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."social_posts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."social_post_targets" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."social_posts" CASCADE;
  DROP TABLE "payload"."social_post_targets" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_social_posts_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_social_post_targets_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_social_posts_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_social_post_targets_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "social_posts_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "social_post_targets_id";
  ALTER TABLE "payload"."social_settings" DROP COLUMN "publish_window_earliest";
  ALTER TABLE "payload"."social_settings" DROP COLUMN "publish_window_latest";
  ALTER TABLE "payload"."social_settings" DROP COLUMN "last_cron_run_at";
  ALTER TABLE "payload"."social_settings" DROP COLUMN "observed_cron_interval_minutes";
  DROP TYPE "payload"."enum_social_posts_status";
  DROP TYPE "payload"."enum_social_post_targets_network";
  DROP TYPE "payload"."enum_social_post_targets_size";
  DROP TYPE "payload"."enum_social_post_targets_status";`)
}
