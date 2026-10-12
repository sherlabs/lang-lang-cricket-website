import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_meeting_templates_items_kind" AS ENUM('general', 'welcome', 'minutes', 'business', 'report', 'financial', 'election', 'close');
  CREATE TYPE "payload"."enum_meeting_templates_kind" AS ENUM('ordinary', 'annual', 'special');
  CREATE TYPE "payload"."enum_meetings_kind" AS ENUM('ordinary', 'annual', 'special');
  CREATE TYPE "payload"."enum_meetings_status" AS ENUM('planned', 'in-progress', 'closed', 'cancelled');
  CREATE TYPE "payload"."enum_meetings_minutes_status" AS ENUM('draft', 'approved');
  CREATE TYPE "payload"."enum_meeting_items_kind" AS ENUM('general', 'welcome', 'minutes', 'business', 'report', 'financial', 'election', 'close');
  CREATE TYPE "payload"."enum_meeting_attendance_state" AS ENUM('present', 'apology', 'absent');
  CREATE TYPE "payload"."enum_meeting_motions_result" AS ENUM('carried', 'lost', 'tabled', 'withdrawn');
  CREATE TYPE "payload"."enum_meeting_actions_status" AS ENUM('open', 'done', 'blocked', 'dropped');
  CREATE TYPE "payload"."enum_committee_documents_category" AS ENUM('governance', 'finance', 'insurance', 'legal', 'policy', 'other');
  ALTER TYPE "payload"."enum_office_audit_log_action" ADD VALUE 'handover';
  CREATE TABLE "payload"."committee_seats" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"sort_order" numeric DEFAULT 100,
  	"holder_id" integer,
  	"holder_user_id" integer,
  	"office_bearer" boolean DEFAULT false,
  	"term_start" timestamp(3) with time zone,
  	"term_end" timestamp(3) with time zone,
  	"handover_note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."meeting_templates_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"kind" "payload"."enum_meeting_templates_items_kind" DEFAULT 'general' NOT NULL,
  	"default_notes" varchar,
  	"restricted" boolean DEFAULT false
  );
  
  CREATE TABLE "payload"."meeting_templates" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"kind" "payload"."enum_meeting_templates_kind" DEFAULT 'ordinary' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."meetings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"kind" "payload"."enum_meetings_kind" DEFAULT 'ordinary' NOT NULL,
  	"starts_at" timestamp(3) with time zone NOT NULL,
  	"venue" varchar,
  	"status" "payload"."enum_meetings_status" DEFAULT 'planned' NOT NULL,
  	"chair_seat_id" integer,
  	"minute_taker_seat_id" integer,
  	"restricted" boolean DEFAULT false NOT NULL,
  	"minutes_text" varchar,
  	"minutes_status" "payload"."enum_meetings_minutes_status" DEFAULT 'draft' NOT NULL,
  	"approved_at_meeting_id" integer,
  	"closed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."meeting_items" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"meeting_id" integer NOT NULL,
  	"order" numeric NOT NULL,
  	"title" varchar NOT NULL,
  	"kind" "payload"."enum_meeting_items_kind" DEFAULT 'general' NOT NULL,
  	"notes" varchar,
  	"outcome" varchar,
  	"restricted" boolean DEFAULT false NOT NULL,
  	"effective_restricted" boolean DEFAULT false NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."meeting_attendance" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"meeting_id" integer NOT NULL,
  	"person_id" integer,
  	"guest_name" varchar,
  	"state" "payload"."enum_meeting_attendance_state" DEFAULT 'present' NOT NULL,
  	"effective_restricted" boolean DEFAULT false NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."meeting_motions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"meeting_id" integer NOT NULL,
  	"item_id" integer,
  	"text" varchar NOT NULL,
  	"votes_for" numeric,
  	"votes_against" numeric,
  	"abstain" numeric,
  	"result" "payload"."enum_meeting_motions_result",
  	"effective_restricted" boolean DEFAULT false NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."meeting_actions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"meeting_id" integer NOT NULL,
  	"item_id" integer,
  	"text" varchar NOT NULL,
  	"owner_seat_id" integer,
  	"owner_person_id" integer,
  	"due" timestamp(3) with time zone,
  	"status" "payload"."enum_meeting_actions_status" DEFAULT 'open' NOT NULL,
  	"done_on" timestamp(3) with time zone,
  	"effective_restricted" boolean DEFAULT false NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."office_files" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"prefix" varchar DEFAULT 'office',
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
  
  CREATE TABLE "payload"."committee_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"category" "payload"."enum_committee_documents_category" DEFAULT 'other' NOT NULL,
  	"file_id" integer NOT NULL,
  	"meeting_id" integer,
  	"uploaded_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "committee_seats_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "meeting_templates_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "meetings_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "meeting_items_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "meeting_attendance_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "meeting_motions_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "meeting_actions_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "office_files_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "committee_documents_id" integer;
  ALTER TABLE "payload"."office_settings" ADD COLUMN "annual_meeting_name" varchar DEFAULT 'Annual general meeting';
  ALTER TABLE "payload"."committee_seats" ADD CONSTRAINT "committee_seats_holder_id_people_id_fk" FOREIGN KEY ("holder_id") REFERENCES "payload"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."committee_seats" ADD CONSTRAINT "committee_seats_holder_user_id_users_id_fk" FOREIGN KEY ("holder_user_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."meeting_templates_items" ADD CONSTRAINT "meeting_templates_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."meeting_templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."meetings" ADD CONSTRAINT "meetings_chair_seat_id_committee_seats_id_fk" FOREIGN KEY ("chair_seat_id") REFERENCES "payload"."committee_seats"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."meetings" ADD CONSTRAINT "meetings_minute_taker_seat_id_committee_seats_id_fk" FOREIGN KEY ("minute_taker_seat_id") REFERENCES "payload"."committee_seats"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."meetings" ADD CONSTRAINT "meetings_approved_at_meeting_id_meetings_id_fk" FOREIGN KEY ("approved_at_meeting_id") REFERENCES "payload"."meetings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."meeting_items" ADD CONSTRAINT "meeting_items_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "payload"."meetings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."meeting_attendance" ADD CONSTRAINT "meeting_attendance_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "payload"."meetings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."meeting_attendance" ADD CONSTRAINT "meeting_attendance_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "payload"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."meeting_motions" ADD CONSTRAINT "meeting_motions_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "payload"."meetings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."meeting_motions" ADD CONSTRAINT "meeting_motions_item_id_meeting_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "payload"."meeting_items"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."meeting_actions" ADD CONSTRAINT "meeting_actions_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "payload"."meetings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."meeting_actions" ADD CONSTRAINT "meeting_actions_item_id_meeting_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "payload"."meeting_items"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."meeting_actions" ADD CONSTRAINT "meeting_actions_owner_seat_id_committee_seats_id_fk" FOREIGN KEY ("owner_seat_id") REFERENCES "payload"."committee_seats"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."meeting_actions" ADD CONSTRAINT "meeting_actions_owner_person_id_people_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "payload"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."committee_documents" ADD CONSTRAINT "committee_documents_file_id_office_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "payload"."office_files"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."committee_documents" ADD CONSTRAINT "committee_documents_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "payload"."meetings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."committee_documents" ADD CONSTRAINT "committee_documents_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "committee_seats_holder_idx" ON "payload"."committee_seats" USING btree ("holder_id");
  CREATE INDEX "committee_seats_holder_user_idx" ON "payload"."committee_seats" USING btree ("holder_user_id");
  CREATE INDEX "committee_seats_updated_at_idx" ON "payload"."committee_seats" USING btree ("updated_at");
  CREATE INDEX "committee_seats_created_at_idx" ON "payload"."committee_seats" USING btree ("created_at");
  CREATE INDEX "meeting_templates_items_order_idx" ON "payload"."meeting_templates_items" USING btree ("_order");
  CREATE INDEX "meeting_templates_items_parent_id_idx" ON "payload"."meeting_templates_items" USING btree ("_parent_id");
  CREATE INDEX "meeting_templates_updated_at_idx" ON "payload"."meeting_templates" USING btree ("updated_at");
  CREATE INDEX "meeting_templates_created_at_idx" ON "payload"."meeting_templates" USING btree ("created_at");
  CREATE INDEX "meetings_starts_at_idx" ON "payload"."meetings" USING btree ("starts_at");
  CREATE INDEX "meetings_status_idx" ON "payload"."meetings" USING btree ("status");
  CREATE INDEX "meetings_chair_seat_idx" ON "payload"."meetings" USING btree ("chair_seat_id");
  CREATE INDEX "meetings_minute_taker_seat_idx" ON "payload"."meetings" USING btree ("minute_taker_seat_id");
  CREATE INDEX "meetings_restricted_idx" ON "payload"."meetings" USING btree ("restricted");
  CREATE INDEX "meetings_approved_at_meeting_idx" ON "payload"."meetings" USING btree ("approved_at_meeting_id");
  CREATE INDEX "meetings_updated_at_idx" ON "payload"."meetings" USING btree ("updated_at");
  CREATE INDEX "meetings_created_at_idx" ON "payload"."meetings" USING btree ("created_at");
  CREATE INDEX "meeting_items_meeting_idx" ON "payload"."meeting_items" USING btree ("meeting_id");
  CREATE INDEX "meeting_items_effective_restricted_idx" ON "payload"."meeting_items" USING btree ("effective_restricted");
  CREATE INDEX "meeting_items_updated_at_idx" ON "payload"."meeting_items" USING btree ("updated_at");
  CREATE INDEX "meeting_items_created_at_idx" ON "payload"."meeting_items" USING btree ("created_at");
  CREATE INDEX "meeting_attendance_meeting_idx" ON "payload"."meeting_attendance" USING btree ("meeting_id");
  CREATE INDEX "meeting_attendance_person_idx" ON "payload"."meeting_attendance" USING btree ("person_id");
  CREATE INDEX "meeting_attendance_effective_restricted_idx" ON "payload"."meeting_attendance" USING btree ("effective_restricted");
  CREATE INDEX "meeting_attendance_updated_at_idx" ON "payload"."meeting_attendance" USING btree ("updated_at");
  CREATE INDEX "meeting_attendance_created_at_idx" ON "payload"."meeting_attendance" USING btree ("created_at");
  CREATE INDEX "meeting_motions_meeting_idx" ON "payload"."meeting_motions" USING btree ("meeting_id");
  CREATE INDEX "meeting_motions_item_idx" ON "payload"."meeting_motions" USING btree ("item_id");
  CREATE INDEX "meeting_motions_effective_restricted_idx" ON "payload"."meeting_motions" USING btree ("effective_restricted");
  CREATE INDEX "meeting_motions_updated_at_idx" ON "payload"."meeting_motions" USING btree ("updated_at");
  CREATE INDEX "meeting_motions_created_at_idx" ON "payload"."meeting_motions" USING btree ("created_at");
  CREATE INDEX "meeting_actions_meeting_idx" ON "payload"."meeting_actions" USING btree ("meeting_id");
  CREATE INDEX "meeting_actions_item_idx" ON "payload"."meeting_actions" USING btree ("item_id");
  CREATE INDEX "meeting_actions_owner_seat_idx" ON "payload"."meeting_actions" USING btree ("owner_seat_id");
  CREATE INDEX "meeting_actions_owner_person_idx" ON "payload"."meeting_actions" USING btree ("owner_person_id");
  CREATE INDEX "meeting_actions_due_idx" ON "payload"."meeting_actions" USING btree ("due");
  CREATE INDEX "meeting_actions_status_idx" ON "payload"."meeting_actions" USING btree ("status");
  CREATE INDEX "meeting_actions_effective_restricted_idx" ON "payload"."meeting_actions" USING btree ("effective_restricted");
  CREATE INDEX "meeting_actions_updated_at_idx" ON "payload"."meeting_actions" USING btree ("updated_at");
  CREATE INDEX "meeting_actions_created_at_idx" ON "payload"."meeting_actions" USING btree ("created_at");
  CREATE INDEX "office_files_updated_at_idx" ON "payload"."office_files" USING btree ("updated_at");
  CREATE INDEX "office_files_created_at_idx" ON "payload"."office_files" USING btree ("created_at");
  CREATE UNIQUE INDEX "office_files_filename_idx" ON "payload"."office_files" USING btree ("filename");
  CREATE INDEX "committee_documents_file_idx" ON "payload"."committee_documents" USING btree ("file_id");
  CREATE INDEX "committee_documents_meeting_idx" ON "payload"."committee_documents" USING btree ("meeting_id");
  CREATE INDEX "committee_documents_uploaded_by_idx" ON "payload"."committee_documents" USING btree ("uploaded_by_id");
  CREATE INDEX "committee_documents_updated_at_idx" ON "payload"."committee_documents" USING btree ("updated_at");
  CREATE INDEX "committee_documents_created_at_idx" ON "payload"."committee_documents" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_committee_seats_fk" FOREIGN KEY ("committee_seats_id") REFERENCES "payload"."committee_seats"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_meeting_templates_fk" FOREIGN KEY ("meeting_templates_id") REFERENCES "payload"."meeting_templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_meetings_fk" FOREIGN KEY ("meetings_id") REFERENCES "payload"."meetings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_meeting_items_fk" FOREIGN KEY ("meeting_items_id") REFERENCES "payload"."meeting_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_meeting_attendance_fk" FOREIGN KEY ("meeting_attendance_id") REFERENCES "payload"."meeting_attendance"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_meeting_motions_fk" FOREIGN KEY ("meeting_motions_id") REFERENCES "payload"."meeting_motions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_meeting_actions_fk" FOREIGN KEY ("meeting_actions_id") REFERENCES "payload"."meeting_actions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_office_files_fk" FOREIGN KEY ("office_files_id") REFERENCES "payload"."office_files"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_committee_documents_fk" FOREIGN KEY ("committee_documents_id") REFERENCES "payload"."committee_documents"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_committee_seats_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("committee_seats_id");
  CREATE INDEX "payload_locked_documents_rels_meeting_templates_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("meeting_templates_id");
  CREATE INDEX "payload_locked_documents_rels_meetings_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("meetings_id");
  CREATE INDEX "payload_locked_documents_rels_meeting_items_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("meeting_items_id");
  CREATE INDEX "payload_locked_documents_rels_meeting_attendance_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("meeting_attendance_id");
  CREATE INDEX "payload_locked_documents_rels_meeting_motions_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("meeting_motions_id");
  CREATE INDEX "payload_locked_documents_rels_meeting_actions_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("meeting_actions_id");
  CREATE INDEX "payload_locked_documents_rels_office_files_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("office_files_id");
  CREATE INDEX "payload_locked_documents_rels_committee_documents_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("committee_documents_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."committee_seats" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."meeting_templates_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."meeting_templates" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."meetings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."meeting_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."meeting_attendance" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."meeting_motions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."meeting_actions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."office_files" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."committee_documents" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."committee_seats" CASCADE;
  DROP TABLE "payload"."meeting_templates_items" CASCADE;
  DROP TABLE "payload"."meeting_templates" CASCADE;
  DROP TABLE "payload"."meetings" CASCADE;
  DROP TABLE "payload"."meeting_items" CASCADE;
  DROP TABLE "payload"."meeting_attendance" CASCADE;
  DROP TABLE "payload"."meeting_motions" CASCADE;
  DROP TABLE "payload"."meeting_actions" CASCADE;
  DROP TABLE "payload"."office_files" CASCADE;
  DROP TABLE "payload"."committee_documents" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_committee_seats_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_meeting_templates_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_meetings_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_meeting_items_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_meeting_attendance_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_meeting_motions_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_meeting_actions_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_office_files_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_committee_documents_fk";
  
  ALTER TABLE "payload"."office_audit_log" ALTER COLUMN "action" SET DATA TYPE text;
  DROP TYPE "payload"."enum_office_audit_log_action";
  CREATE TYPE "payload"."enum_office_audit_log_action" AS ENUM('export', 'email-send', 'erase', 'bulk-change');
  ALTER TABLE "payload"."office_audit_log" ALTER COLUMN "action" SET DATA TYPE "payload"."enum_office_audit_log_action" USING "action"::"payload"."enum_office_audit_log_action";
  DROP INDEX "payload"."payload_locked_documents_rels_committee_seats_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_meeting_templates_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_meetings_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_meeting_items_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_meeting_attendance_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_meeting_motions_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_meeting_actions_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_office_files_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_committee_documents_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "committee_seats_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "meeting_templates_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "meetings_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "meeting_items_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "meeting_attendance_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "meeting_motions_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "meeting_actions_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "office_files_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "committee_documents_id";
  ALTER TABLE "payload"."office_settings" DROP COLUMN "annual_meeting_name";
  DROP TYPE "payload"."enum_meeting_templates_items_kind";
  DROP TYPE "payload"."enum_meeting_templates_kind";
  DROP TYPE "payload"."enum_meetings_kind";
  DROP TYPE "payload"."enum_meetings_status";
  DROP TYPE "payload"."enum_meetings_minutes_status";
  DROP TYPE "payload"."enum_meeting_items_kind";
  DROP TYPE "payload"."enum_meeting_attendance_state";
  DROP TYPE "payload"."enum_meeting_motions_result";
  DROP TYPE "payload"."enum_meeting_actions_status";
  DROP TYPE "payload"."enum_committee_documents_category";`)
}
