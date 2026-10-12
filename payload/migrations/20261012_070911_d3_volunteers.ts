import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_volunteer_weeks_status" AS ENUM('draft', 'open', 'confirmed');
  CREATE TYPE "payload"."enum_volunteer_assignments_kind" AS ENUM('volunteer', 'paid');
  CREATE TYPE "payload"."enum_volunteer_assignments_state" AS ENUM('rostered', 'confirmed', 'no-show', 'cancelled');
  CREATE TYPE "payload"."enum_volunteer_availability_state" AS ENUM('yes', 'no', 'maybe');
  CREATE TYPE "payload"."enum_volunteer_hours_kind" AS ENUM('volunteer', 'paid');
  CREATE TYPE "payload"."enum_volunteer_hours_source" AS ENUM('roster', 'manual');
  CREATE TYPE "payload"."enum_office_settings_shift_types_kind" AS ENUM('volunteer', 'paid');
  CREATE TABLE "payload"."volunteer_weeks" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"season" varchar NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL,
  	"label" varchar,
  	"status" "payload"."enum_volunteer_weeks_status" DEFAULT 'draft' NOT NULL,
  	"confirmed_at" timestamp(3) with time zone,
  	"confirmed_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."volunteer_shifts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"week_id" integer NOT NULL,
  	"shift_type_key" varchar NOT NULL,
  	"label_snapshot" varchar NOT NULL,
  	"hours" numeric NOT NULL,
  	"slots" numeric NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."volunteer_assignments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"shift_id" integer NOT NULL,
  	"member_id" integer NOT NULL,
  	"kind" "payload"."enum_volunteer_assignments_kind" DEFAULT 'volunteer' NOT NULL,
  	"hours" numeric NOT NULL,
  	"state" "payload"."enum_volunteer_assignments_state" DEFAULT 'rostered' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."volunteer_availability" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"member_id" integer NOT NULL,
  	"week_id" integer NOT NULL,
  	"state" "payload"."enum_volunteer_availability_state" NOT NULL,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."volunteer_availability_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "payload"."volunteer_hours" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"member_id" integer NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL,
  	"hours" numeric NOT NULL,
  	"kind" "payload"."enum_volunteer_hours_kind" DEFAULT 'volunteer' NOT NULL,
  	"shift_type_key" varchar,
  	"week_id" integer,
  	"assignment_id" integer,
  	"source" "payload"."enum_volunteer_hours_source" DEFAULT 'roster' NOT NULL,
  	"note" varchar,
  	"recorded_by_id" integer,
  	"voided_at" timestamp(3) with time zone,
  	"voided_by_id" integer,
  	"void_reason" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."office_settings_shift_types" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"label" varchar NOT NULL,
  	"default_hours" numeric DEFAULT 2 NOT NULL,
  	"default_slots" numeric DEFAULT 1 NOT NULL,
  	"kind" "payload"."enum_office_settings_shift_types_kind" DEFAULT 'volunteer' NOT NULL
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "volunteer_weeks_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "volunteer_shifts_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "volunteer_assignments_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "volunteer_availability_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "volunteer_hours_id" integer;
  ALTER TABLE "payload"."volunteer_weeks" ADD CONSTRAINT "volunteer_weeks_confirmed_by_id_users_id_fk" FOREIGN KEY ("confirmed_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."volunteer_shifts" ADD CONSTRAINT "volunteer_shifts_week_id_volunteer_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "payload"."volunteer_weeks"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."volunteer_assignments" ADD CONSTRAINT "volunteer_assignments_shift_id_volunteer_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "payload"."volunteer_shifts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."volunteer_assignments" ADD CONSTRAINT "volunteer_assignments_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "payload"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."volunteer_availability" ADD CONSTRAINT "volunteer_availability_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "payload"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."volunteer_availability" ADD CONSTRAINT "volunteer_availability_week_id_volunteer_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "payload"."volunteer_weeks"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."volunteer_availability_texts" ADD CONSTRAINT "volunteer_availability_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."volunteer_availability"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."volunteer_hours" ADD CONSTRAINT "volunteer_hours_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "payload"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."volunteer_hours" ADD CONSTRAINT "volunteer_hours_week_id_volunteer_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "payload"."volunteer_weeks"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."volunteer_hours" ADD CONSTRAINT "volunteer_hours_assignment_id_volunteer_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "payload"."volunteer_assignments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."volunteer_hours" ADD CONSTRAINT "volunteer_hours_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."volunteer_hours" ADD CONSTRAINT "volunteer_hours_voided_by_id_users_id_fk" FOREIGN KEY ("voided_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."office_settings_shift_types" ADD CONSTRAINT "office_settings_shift_types_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."office_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "volunteer_weeks_season_idx" ON "payload"."volunteer_weeks" USING btree ("season");
  CREATE UNIQUE INDEX "volunteer_weeks_date_idx" ON "payload"."volunteer_weeks" USING btree ("date");
  CREATE INDEX "volunteer_weeks_status_idx" ON "payload"."volunteer_weeks" USING btree ("status");
  CREATE INDEX "volunteer_weeks_confirmed_by_idx" ON "payload"."volunteer_weeks" USING btree ("confirmed_by_id");
  CREATE INDEX "volunteer_weeks_updated_at_idx" ON "payload"."volunteer_weeks" USING btree ("updated_at");
  CREATE INDEX "volunteer_weeks_created_at_idx" ON "payload"."volunteer_weeks" USING btree ("created_at");
  CREATE INDEX "volunteer_shifts_week_idx" ON "payload"."volunteer_shifts" USING btree ("week_id");
  CREATE INDEX "volunteer_shifts_shift_type_key_idx" ON "payload"."volunteer_shifts" USING btree ("shift_type_key");
  CREATE INDEX "volunteer_shifts_updated_at_idx" ON "payload"."volunteer_shifts" USING btree ("updated_at");
  CREATE INDEX "volunteer_shifts_created_at_idx" ON "payload"."volunteer_shifts" USING btree ("created_at");
  CREATE INDEX "volunteer_assignments_shift_idx" ON "payload"."volunteer_assignments" USING btree ("shift_id");
  CREATE INDEX "volunteer_assignments_member_idx" ON "payload"."volunteer_assignments" USING btree ("member_id");
  CREATE INDEX "volunteer_assignments_state_idx" ON "payload"."volunteer_assignments" USING btree ("state");
  CREATE INDEX "volunteer_assignments_updated_at_idx" ON "payload"."volunteer_assignments" USING btree ("updated_at");
  CREATE INDEX "volunteer_assignments_created_at_idx" ON "payload"."volunteer_assignments" USING btree ("created_at");
  CREATE UNIQUE INDEX "shift_member_idx" ON "payload"."volunteer_assignments" USING btree ("shift_id","member_id");
  CREATE INDEX "volunteer_availability_member_idx" ON "payload"."volunteer_availability" USING btree ("member_id");
  CREATE INDEX "volunteer_availability_week_idx" ON "payload"."volunteer_availability" USING btree ("week_id");
  CREATE INDEX "volunteer_availability_updated_at_idx" ON "payload"."volunteer_availability" USING btree ("updated_at");
  CREATE INDEX "volunteer_availability_created_at_idx" ON "payload"."volunteer_availability" USING btree ("created_at");
  CREATE UNIQUE INDEX "member_week_idx" ON "payload"."volunteer_availability" USING btree ("member_id","week_id");
  CREATE INDEX "volunteer_availability_texts_order_parent" ON "payload"."volunteer_availability_texts" USING btree ("order","parent_id");
  CREATE INDEX "volunteer_hours_member_idx" ON "payload"."volunteer_hours" USING btree ("member_id");
  CREATE INDEX "volunteer_hours_date_idx" ON "payload"."volunteer_hours" USING btree ("date");
  CREATE INDEX "volunteer_hours_shift_type_key_idx" ON "payload"."volunteer_hours" USING btree ("shift_type_key");
  CREATE INDEX "volunteer_hours_week_idx" ON "payload"."volunteer_hours" USING btree ("week_id");
  CREATE INDEX "volunteer_hours_assignment_idx" ON "payload"."volunteer_hours" USING btree ("assignment_id");
  CREATE INDEX "volunteer_hours_recorded_by_idx" ON "payload"."volunteer_hours" USING btree ("recorded_by_id");
  CREATE INDEX "volunteer_hours_voided_by_idx" ON "payload"."volunteer_hours" USING btree ("voided_by_id");
  CREATE INDEX "volunteer_hours_updated_at_idx" ON "payload"."volunteer_hours" USING btree ("updated_at");
  CREATE INDEX "volunteer_hours_created_at_idx" ON "payload"."volunteer_hours" USING btree ("created_at");
  CREATE INDEX "member_date_idx" ON "payload"."volunteer_hours" USING btree ("member_id","date");
  CREATE INDEX "office_settings_shift_types_order_idx" ON "payload"."office_settings_shift_types" USING btree ("_order");
  CREATE INDEX "office_settings_shift_types_parent_id_idx" ON "payload"."office_settings_shift_types" USING btree ("_parent_id");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_volunteer_weeks_fk" FOREIGN KEY ("volunteer_weeks_id") REFERENCES "payload"."volunteer_weeks"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_volunteer_shifts_fk" FOREIGN KEY ("volunteer_shifts_id") REFERENCES "payload"."volunteer_shifts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_volunteer_assignments_fk" FOREIGN KEY ("volunteer_assignments_id") REFERENCES "payload"."volunteer_assignments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_volunteer_availability_fk" FOREIGN KEY ("volunteer_availability_id") REFERENCES "payload"."volunteer_availability"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_volunteer_hours_fk" FOREIGN KEY ("volunteer_hours_id") REFERENCES "payload"."volunteer_hours"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_volunteer_weeks_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("volunteer_weeks_id");
  CREATE INDEX "payload_locked_documents_rels_volunteer_shifts_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("volunteer_shifts_id");
  CREATE INDEX "payload_locked_documents_rels_volunteer_assignments_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("volunteer_assignments_id");
  CREATE INDEX "payload_locked_documents_rels_volunteer_availability_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("volunteer_availability_id");
  CREATE INDEX "payload_locked_documents_rels_volunteer_hours_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("volunteer_hours_id");`)
  // Payload cannot express a partial index, so it is raw SQL: at most one LIVE ledger row per assignment, while a voided row never blocks
  // a later confirm (wave D spec 5.1). Kept out of the collection config on purpose.
  await db.execute(sql`CREATE UNIQUE INDEX "volunteer_hours_one_live_per_assignment" ON "payload"."volunteer_hours" USING btree ("assignment_id") WHERE "assignment_id" IS NOT NULL AND "voided_at" IS NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS "payload"."volunteer_hours_one_live_per_assignment";`)
  await db.execute(sql`
   ALTER TABLE "payload"."volunteer_weeks" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."volunteer_shifts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."volunteer_assignments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."volunteer_availability" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."volunteer_availability_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."volunteer_hours" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."office_settings_shift_types" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."volunteer_weeks" CASCADE;
  DROP TABLE "payload"."volunteer_shifts" CASCADE;
  DROP TABLE "payload"."volunteer_assignments" CASCADE;
  DROP TABLE "payload"."volunteer_availability" CASCADE;
  DROP TABLE "payload"."volunteer_availability_texts" CASCADE;
  DROP TABLE "payload"."volunteer_hours" CASCADE;
  DROP TABLE "payload"."office_settings_shift_types" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_volunteer_weeks_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_volunteer_shifts_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_volunteer_assignments_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_volunteer_availability_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_volunteer_hours_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_volunteer_weeks_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_volunteer_shifts_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_volunteer_assignments_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_volunteer_availability_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_volunteer_hours_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "volunteer_weeks_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "volunteer_shifts_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "volunteer_assignments_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "volunteer_availability_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "volunteer_hours_id";
  DROP TYPE "payload"."enum_volunteer_weeks_status";
  DROP TYPE "payload"."enum_volunteer_assignments_kind";
  DROP TYPE "payload"."enum_volunteer_assignments_state";
  DROP TYPE "payload"."enum_volunteer_availability_state";
  DROP TYPE "payload"."enum_volunteer_hours_kind";
  DROP TYPE "payload"."enum_volunteer_hours_source";
  DROP TYPE "payload"."enum_office_settings_shift_types_kind";`)
}
