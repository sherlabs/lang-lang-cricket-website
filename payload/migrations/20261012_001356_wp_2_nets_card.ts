import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_player_selection_profiles_batting_style" AS ENUM('right-hand', 'left-hand');
  CREATE TYPE "payload"."enum_player_selection_profiles_bowling_style" AS ENUM('none', 'right-arm fast', 'right-arm medium', 'right-arm off-break', 'right-arm leg-break', 'left-arm fast', 'left-arm medium', 'left-arm orthodox', 'left-arm wrist spin');
  CREATE TYPE "payload"."enum_net_sessions_state" AS ENUM('planned', 'running', 'paused', 'finished');
  CREATE TABLE "payload"."net_sessions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"date" varchar NOT NULL,
  	"start_time" varchar,
  	"nets" numeric DEFAULT 3 NOT NULL,
  	"minutes_per_turn" numeric DEFAULT 10 NOT NULL,
  	"group_size" numeric DEFAULT 4 NOT NULL,
  	"state" "payload"."enum_net_sessions_state" DEFAULT 'planned' NOT NULL,
  	"round" numeric DEFAULT 0,
  	"round_started_at" timestamp(3) with time zone,
  	"paused_at" timestamp(3) with time zone,
  	"revision" numeric DEFAULT 1,
  	"rotation_plan" jsonb,
  	"finished_at" timestamp(3) with time zone,
  	"notes" varchar,
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."net_attendance" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"session_id" integer NOT NULL,
  	"player_key" varchar NOT NULL,
  	"player_id" integer,
  	"guest_name" varchar,
  	"checked_in_at" timestamp(3) with time zone,
  	"checked_in_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."player_selection_profiles" ADD COLUMN "batting_style" "payload"."enum_player_selection_profiles_batting_style";
  ALTER TABLE "payload"."player_selection_profiles" ADD COLUMN "bowling_style" "payload"."enum_player_selection_profiles_bowling_style";
  ALTER TABLE "payload"."player_selection_profiles" ADD COLUMN "notes_staff_only" boolean DEFAULT false;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "net_sessions_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "net_attendance_id" integer;
  ALTER TABLE "payload"."net_sessions" ADD CONSTRAINT "net_sessions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."net_attendance" ADD CONSTRAINT "net_attendance_session_id_net_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "payload"."net_sessions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."net_attendance" ADD CONSTRAINT "net_attendance_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "payload"."players"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."net_attendance" ADD CONSTRAINT "net_attendance_checked_in_by_id_users_id_fk" FOREIGN KEY ("checked_in_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "net_sessions_date_idx" ON "payload"."net_sessions" USING btree ("date");
  CREATE INDEX "net_sessions_state_idx" ON "payload"."net_sessions" USING btree ("state");
  CREATE INDEX "net_sessions_created_by_idx" ON "payload"."net_sessions" USING btree ("created_by_id");
  CREATE INDEX "net_sessions_updated_at_idx" ON "payload"."net_sessions" USING btree ("updated_at");
  CREATE INDEX "net_sessions_created_at_idx" ON "payload"."net_sessions" USING btree ("created_at");
  CREATE INDEX "net_attendance_session_idx" ON "payload"."net_attendance" USING btree ("session_id");
  CREATE INDEX "net_attendance_player_idx" ON "payload"."net_attendance" USING btree ("player_id");
  CREATE INDEX "net_attendance_checked_in_by_idx" ON "payload"."net_attendance" USING btree ("checked_in_by_id");
  CREATE INDEX "net_attendance_updated_at_idx" ON "payload"."net_attendance" USING btree ("updated_at");
  CREATE INDEX "net_attendance_created_at_idx" ON "payload"."net_attendance" USING btree ("created_at");
  CREATE UNIQUE INDEX "session_playerKey_idx" ON "payload"."net_attendance" USING btree ("session_id","player_key");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_net_sessions_fk" FOREIGN KEY ("net_sessions_id") REFERENCES "payload"."net_sessions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_net_attendance_fk" FOREIGN KEY ("net_attendance_id") REFERENCES "payload"."net_attendance"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_net_sessions_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("net_sessions_id");
  CREATE INDEX "payload_locked_documents_rels_net_attendance_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("net_attendance_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."net_sessions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."net_attendance" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."net_sessions" CASCADE;
  DROP TABLE "payload"."net_attendance" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_net_sessions_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_net_attendance_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_net_sessions_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_net_attendance_id_idx";
  ALTER TABLE "payload"."player_selection_profiles" DROP COLUMN "batting_style";
  ALTER TABLE "payload"."player_selection_profiles" DROP COLUMN "bowling_style";
  ALTER TABLE "payload"."player_selection_profiles" DROP COLUMN "notes_staff_only";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "net_sessions_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "net_attendance_id";
  DROP TYPE "payload"."enum_player_selection_profiles_batting_style";
  DROP TYPE "payload"."enum_player_selection_profiles_bowling_style";
  DROP TYPE "payload"."enum_net_sessions_state";`)
}
