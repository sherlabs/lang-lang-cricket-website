import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."ai_draft_counter" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"day" varchar NOT NULL,
  	"count" numeric DEFAULT 0 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."yearbooks" ADD COLUMN "season_summary" varchar DEFAULT '';
  ALTER TABLE "payload"."yearbooks" ADD COLUMN "season_summary_ai" boolean DEFAULT false;
  ALTER TABLE "payload"."yearbooks" ADD COLUMN "season_summary_checked" boolean DEFAULT false;
  ALTER TABLE "payload"."yearbooks" ADD COLUMN "season_summary_checked_by_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "ai_draft_counter_id" integer;
  CREATE UNIQUE INDEX "ai_draft_counter_day_idx" ON "payload"."ai_draft_counter" USING btree ("day");
  CREATE INDEX "ai_draft_counter_updated_at_idx" ON "payload"."ai_draft_counter" USING btree ("updated_at");
  CREATE INDEX "ai_draft_counter_created_at_idx" ON "payload"."ai_draft_counter" USING btree ("created_at");
  ALTER TABLE "payload"."yearbooks" ADD CONSTRAINT "yearbooks_season_summary_checked_by_id_users_id_fk" FOREIGN KEY ("season_summary_checked_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_draft_counter_fk" FOREIGN KEY ("ai_draft_counter_id") REFERENCES "payload"."ai_draft_counter"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "yearbooks_season_summary_checked_by_idx" ON "payload"."yearbooks" USING btree ("season_summary_checked_by_id");
  CREATE INDEX "payload_locked_documents_rels_ai_draft_counter_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("ai_draft_counter_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."ai_draft_counter" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."ai_draft_counter" CASCADE;
  ALTER TABLE "payload"."yearbooks" DROP CONSTRAINT "yearbooks_season_summary_checked_by_id_users_id_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ai_draft_counter_fk";
  
  DROP INDEX "payload"."yearbooks_season_summary_checked_by_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_ai_draft_counter_id_idx";
  ALTER TABLE "payload"."yearbooks" DROP COLUMN "season_summary";
  ALTER TABLE "payload"."yearbooks" DROP COLUMN "season_summary_ai";
  ALTER TABLE "payload"."yearbooks" DROP COLUMN "season_summary_checked";
  ALTER TABLE "payload"."yearbooks" DROP COLUMN "season_summary_checked_by_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "ai_draft_counter_id";`)
}
