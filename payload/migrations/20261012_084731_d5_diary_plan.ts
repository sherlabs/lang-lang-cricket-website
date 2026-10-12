import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_plan_objectives_status" AS ENUM('not-started', 'on-track', 'at-risk', 'done', 'dropped');
  CREATE TYPE "payload"."enum_diary_jobs_category" AS ENUM('registration', 'governance', 'insurance', 'permits', 'finance', 'ground', 'events', 'other');
  CREATE TYPE "payload"."enum_diary_jobs_status" AS ENUM('todo', 'in-progress', 'blocked', 'done');
  CREATE TABLE "payload"."plan_pillars" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"summary" varchar,
  	"sort_order" numeric DEFAULT 100,
  	"source_key" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."plan_objectives" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"pillar_id" integer NOT NULL,
  	"title" varchar NOT NULL,
  	"owner_seat_id" integer,
  	"target_date" timestamp(3) with time zone,
  	"budget_cents" numeric,
  	"status" "payload"."enum_plan_objectives_status" DEFAULT 'not-started' NOT NULL,
  	"progress_note" varchar,
  	"sort_order" numeric DEFAULT 100,
  	"source_key" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."diary_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"season" varchar NOT NULL,
  	"category" "payload"."enum_diary_jobs_category" DEFAULT 'other' NOT NULL,
  	"due" timestamp(3) with time zone,
  	"owner_seat_id" integer,
  	"owner_person_id" integer,
  	"budget_cents" numeric,
  	"actual_cents" numeric,
  	"status" "payload"."enum_diary_jobs_status" DEFAULT 'todo' NOT NULL,
  	"blocked_reason" varchar,
  	"done_on" timestamp(3) with time zone,
  	"objective_id" integer,
  	"repeats_yearly" boolean DEFAULT false,
  	"notes" varchar,
  	"source_key" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "plan_pillars_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "plan_objectives_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "diary_jobs_id" integer;
  ALTER TABLE "payload"."office_settings" ADD COLUMN "diary_lead_days" numeric DEFAULT 14;
  ALTER TABLE "payload"."office_settings" ADD COLUMN "diary_category_labels_registration" varchar DEFAULT 'Registration';
  ALTER TABLE "payload"."office_settings" ADD COLUMN "diary_category_labels_governance" varchar DEFAULT 'Governance';
  ALTER TABLE "payload"."office_settings" ADD COLUMN "diary_category_labels_insurance" varchar DEFAULT 'Insurance';
  ALTER TABLE "payload"."office_settings" ADD COLUMN "diary_category_labels_permits" varchar DEFAULT 'Permits';
  ALTER TABLE "payload"."office_settings" ADD COLUMN "diary_category_labels_finance" varchar DEFAULT 'Finance';
  ALTER TABLE "payload"."office_settings" ADD COLUMN "diary_category_labels_ground" varchar DEFAULT 'Ground';
  ALTER TABLE "payload"."office_settings" ADD COLUMN "diary_category_labels_events" varchar DEFAULT 'Events';
  ALTER TABLE "payload"."office_settings" ADD COLUMN "diary_category_labels_other" varchar DEFAULT 'Other';
  ALTER TABLE "payload"."plan_objectives" ADD CONSTRAINT "plan_objectives_pillar_id_plan_pillars_id_fk" FOREIGN KEY ("pillar_id") REFERENCES "payload"."plan_pillars"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."plan_objectives" ADD CONSTRAINT "plan_objectives_owner_seat_id_committee_seats_id_fk" FOREIGN KEY ("owner_seat_id") REFERENCES "payload"."committee_seats"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."diary_jobs" ADD CONSTRAINT "diary_jobs_owner_seat_id_committee_seats_id_fk" FOREIGN KEY ("owner_seat_id") REFERENCES "payload"."committee_seats"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."diary_jobs" ADD CONSTRAINT "diary_jobs_owner_person_id_people_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "payload"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."diary_jobs" ADD CONSTRAINT "diary_jobs_objective_id_plan_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "payload"."plan_objectives"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "plan_pillars_source_key_idx" ON "payload"."plan_pillars" USING btree ("source_key");
  CREATE INDEX "plan_pillars_updated_at_idx" ON "payload"."plan_pillars" USING btree ("updated_at");
  CREATE INDEX "plan_pillars_created_at_idx" ON "payload"."plan_pillars" USING btree ("created_at");
  CREATE INDEX "plan_objectives_pillar_idx" ON "payload"."plan_objectives" USING btree ("pillar_id");
  CREATE INDEX "plan_objectives_owner_seat_idx" ON "payload"."plan_objectives" USING btree ("owner_seat_id");
  CREATE INDEX "plan_objectives_source_key_idx" ON "payload"."plan_objectives" USING btree ("source_key");
  CREATE INDEX "plan_objectives_updated_at_idx" ON "payload"."plan_objectives" USING btree ("updated_at");
  CREATE INDEX "plan_objectives_created_at_idx" ON "payload"."plan_objectives" USING btree ("created_at");
  CREATE INDEX "diary_jobs_season_idx" ON "payload"."diary_jobs" USING btree ("season");
  CREATE INDEX "diary_jobs_due_idx" ON "payload"."diary_jobs" USING btree ("due");
  CREATE INDEX "diary_jobs_owner_seat_idx" ON "payload"."diary_jobs" USING btree ("owner_seat_id");
  CREATE INDEX "diary_jobs_owner_person_idx" ON "payload"."diary_jobs" USING btree ("owner_person_id");
  CREATE INDEX "diary_jobs_status_idx" ON "payload"."diary_jobs" USING btree ("status");
  CREATE INDEX "diary_jobs_objective_idx" ON "payload"."diary_jobs" USING btree ("objective_id");
  CREATE INDEX "diary_jobs_source_key_idx" ON "payload"."diary_jobs" USING btree ("source_key");
  CREATE INDEX "diary_jobs_updated_at_idx" ON "payload"."diary_jobs" USING btree ("updated_at");
  CREATE INDEX "diary_jobs_created_at_idx" ON "payload"."diary_jobs" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_plan_pillars_fk" FOREIGN KEY ("plan_pillars_id") REFERENCES "payload"."plan_pillars"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_plan_objectives_fk" FOREIGN KEY ("plan_objectives_id") REFERENCES "payload"."plan_objectives"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_diary_jobs_fk" FOREIGN KEY ("diary_jobs_id") REFERENCES "payload"."diary_jobs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_plan_pillars_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("plan_pillars_id");
  CREATE INDEX "payload_locked_documents_rels_plan_objectives_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("plan_objectives_id");
  CREATE INDEX "payload_locked_documents_rels_diary_jobs_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("diary_jobs_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."plan_pillars" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."plan_objectives" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."diary_jobs" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."plan_pillars" CASCADE;
  DROP TABLE "payload"."plan_objectives" CASCADE;
  DROP TABLE "payload"."diary_jobs" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_plan_pillars_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_plan_objectives_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_diary_jobs_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_plan_pillars_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_plan_objectives_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_diary_jobs_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "plan_pillars_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "plan_objectives_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "diary_jobs_id";
  ALTER TABLE "payload"."office_settings" DROP COLUMN "diary_lead_days";
  ALTER TABLE "payload"."office_settings" DROP COLUMN "diary_category_labels_registration";
  ALTER TABLE "payload"."office_settings" DROP COLUMN "diary_category_labels_governance";
  ALTER TABLE "payload"."office_settings" DROP COLUMN "diary_category_labels_insurance";
  ALTER TABLE "payload"."office_settings" DROP COLUMN "diary_category_labels_permits";
  ALTER TABLE "payload"."office_settings" DROP COLUMN "diary_category_labels_finance";
  ALTER TABLE "payload"."office_settings" DROP COLUMN "diary_category_labels_ground";
  ALTER TABLE "payload"."office_settings" DROP COLUMN "diary_category_labels_events";
  ALTER TABLE "payload"."office_settings" DROP COLUMN "diary_category_labels_other";
  DROP TYPE "payload"."enum_plan_objectives_status";
  DROP TYPE "payload"."enum_diary_jobs_category";
  DROP TYPE "payload"."enum_diary_jobs_status";`)
}
