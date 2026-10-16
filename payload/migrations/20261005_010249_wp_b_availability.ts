import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_player_selection_profiles_pin_source" AS ENUM('phone', 'manual');
  CREATE TYPE "payload"."enum_player_selection_profiles_role" AS ENUM('batter', 'bowler', 'all-rounder', 'keeper');
  CREATE TYPE "payload"."enum_selection_fixtures_status" AS ENUM('upcoming', 'final', 'removed');
  CREATE TYPE "payload"."enum_availability_status" AS ENUM('in', 'maybe', 'out');
  CREATE TYPE "payload"."enum_availability_source" AS ENUM('player', 'selector');
  CREATE TABLE "payload"."player_selection_profiles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"player_id" integer NOT NULL,
  	"phone" varchar,
  	"pin_hash" varchar,
  	"pin_salt" varchar,
  	"pin_source" "payload"."enum_player_selection_profiles_pin_source",
  	"pin_set_at" timestamp(3) with time zone,
  	"needs_manual_pin" boolean DEFAULT false,
  	"otc_hash" varchar,
  	"otc_expires_at" timestamp(3) with time zone,
  	"role" "payload"."enum_player_selection_profiles_role",
  	"can_keep" boolean DEFAULT false,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."selection_fixtures" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"game_id" varchar NOT NULL,
  	"grade_id" varchar NOT NULL,
  	"grade_name" varchar NOT NULL,
  	"club_team_id" varchar NOT NULL,
  	"club_team_name" varchar NOT NULL,
  	"round_name" varchar,
  	"local_date" varchar NOT NULL,
  	"local_time" varchar,
  	"starts_at" timestamp(3) with time zone,
  	"venue_name" varchar,
  	"venue_suburb" varchar,
  	"opponent_name" varchar NOT NULL,
  	"is_home" boolean DEFAULT false,
  	"status" "payload"."enum_selection_fixtures_status" DEFAULT 'upcoming' NOT NULL,
  	"synced_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."availability" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"player_id" integer NOT NULL,
  	"fixture_id" integer NOT NULL,
  	"status" "payload"."enum_availability_status" NOT NULL,
  	"note" varchar,
  	"source" "payload"."enum_availability_source",
  	"set_by_id" integer,
  	"responded_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."squads" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"season_start_year" numeric NOT NULL,
  	"grade_id" varchar NOT NULL,
  	"grade_name" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."squad_members" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"squad_id" integer NOT NULL,
  	"player_id" integer NOT NULL,
  	"added_by_id" integer,
  	"added_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."selection_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"link_enabled" boolean DEFAULT true,
  	"link_version" numeric DEFAULT 1 NOT NULL,
  	"availability_lock_hours" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "player_selection_profiles_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "selection_fixtures_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "availability_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "squads_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "squad_members_id" integer;
  ALTER TABLE "payload"."player_selection_profiles" ADD CONSTRAINT "player_selection_profiles_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "payload"."players"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."availability" ADD CONSTRAINT "availability_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "payload"."players"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."availability" ADD CONSTRAINT "availability_fixture_id_selection_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "payload"."selection_fixtures"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."availability" ADD CONSTRAINT "availability_set_by_id_users_id_fk" FOREIGN KEY ("set_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."squad_members" ADD CONSTRAINT "squad_members_squad_id_squads_id_fk" FOREIGN KEY ("squad_id") REFERENCES "payload"."squads"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."squad_members" ADD CONSTRAINT "squad_members_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "payload"."players"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."squad_members" ADD CONSTRAINT "squad_members_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "player_selection_profiles_player_idx" ON "payload"."player_selection_profiles" USING btree ("player_id");
  CREATE INDEX "player_selection_profiles_updated_at_idx" ON "payload"."player_selection_profiles" USING btree ("updated_at");
  CREATE INDEX "player_selection_profiles_created_at_idx" ON "payload"."player_selection_profiles" USING btree ("created_at");
  CREATE UNIQUE INDEX "selection_fixtures_game_id_idx" ON "payload"."selection_fixtures" USING btree ("game_id");
  CREATE INDEX "selection_fixtures_grade_id_idx" ON "payload"."selection_fixtures" USING btree ("grade_id");
  CREATE INDEX "selection_fixtures_local_date_idx" ON "payload"."selection_fixtures" USING btree ("local_date");
  CREATE INDEX "selection_fixtures_status_idx" ON "payload"."selection_fixtures" USING btree ("status");
  CREATE INDEX "selection_fixtures_updated_at_idx" ON "payload"."selection_fixtures" USING btree ("updated_at");
  CREATE INDEX "selection_fixtures_created_at_idx" ON "payload"."selection_fixtures" USING btree ("created_at");
  CREATE INDEX "availability_player_idx" ON "payload"."availability" USING btree ("player_id");
  CREATE INDEX "availability_fixture_idx" ON "payload"."availability" USING btree ("fixture_id");
  CREATE INDEX "availability_set_by_idx" ON "payload"."availability" USING btree ("set_by_id");
  CREATE INDEX "availability_updated_at_idx" ON "payload"."availability" USING btree ("updated_at");
  CREATE INDEX "availability_created_at_idx" ON "payload"."availability" USING btree ("created_at");
  CREATE UNIQUE INDEX "player_fixture_idx" ON "payload"."availability" USING btree ("player_id","fixture_id");
  CREATE INDEX "squads_season_start_year_idx" ON "payload"."squads" USING btree ("season_start_year");
  CREATE INDEX "squads_updated_at_idx" ON "payload"."squads" USING btree ("updated_at");
  CREATE INDEX "squads_created_at_idx" ON "payload"."squads" USING btree ("created_at");
  CREATE UNIQUE INDEX "seasonStartYear_gradeId_1_idx" ON "payload"."squads" USING btree ("season_start_year","grade_id");
  CREATE INDEX "squad_members_squad_idx" ON "payload"."squad_members" USING btree ("squad_id");
  CREATE INDEX "squad_members_player_idx" ON "payload"."squad_members" USING btree ("player_id");
  CREATE INDEX "squad_members_added_by_idx" ON "payload"."squad_members" USING btree ("added_by_id");
  CREATE INDEX "squad_members_updated_at_idx" ON "payload"."squad_members" USING btree ("updated_at");
  CREATE INDEX "squad_members_created_at_idx" ON "payload"."squad_members" USING btree ("created_at");
  CREATE UNIQUE INDEX "squad_player_idx" ON "payload"."squad_members" USING btree ("squad_id","player_id");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_player_selection_profiles_fk" FOREIGN KEY ("player_selection_profiles_id") REFERENCES "payload"."player_selection_profiles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_selection_fixtures_fk" FOREIGN KEY ("selection_fixtures_id") REFERENCES "payload"."selection_fixtures"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_availability_fk" FOREIGN KEY ("availability_id") REFERENCES "payload"."availability"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_squads_fk" FOREIGN KEY ("squads_id") REFERENCES "payload"."squads"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_squad_members_fk" FOREIGN KEY ("squad_members_id") REFERENCES "payload"."squad_members"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_player_selection_profiles__idx" ON "payload"."payload_locked_documents_rels" USING btree ("player_selection_profiles_id");
  CREATE INDEX "payload_locked_documents_rels_selection_fixtures_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("selection_fixtures_id");
  CREATE INDEX "payload_locked_documents_rels_availability_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("availability_id");
  CREATE INDEX "payload_locked_documents_rels_squads_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("squads_id");
  CREATE INDEX "payload_locked_documents_rels_squad_members_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("squad_members_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."player_selection_profiles" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."selection_fixtures" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."availability" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."squads" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."squad_members" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."selection_settings" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."player_selection_profiles" CASCADE;
  DROP TABLE "payload"."selection_fixtures" CASCADE;
  DROP TABLE "payload"."availability" CASCADE;
  DROP TABLE "payload"."squads" CASCADE;
  DROP TABLE "payload"."squad_members" CASCADE;
  DROP TABLE "payload"."selection_settings" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_player_selection_profiles_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_selection_fixtures_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_availability_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_squads_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_squad_members_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_player_selection_profiles__idx";
  DROP INDEX "payload"."payload_locked_documents_rels_selection_fixtures_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_availability_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_squads_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_squad_members_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "player_selection_profiles_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "selection_fixtures_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "availability_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "squads_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "squad_members_id";
  DROP TYPE "payload"."enum_player_selection_profiles_pin_source";
  DROP TYPE "payload"."enum_player_selection_profiles_role";
  DROP TYPE "payload"."enum_selection_fixtures_status";
  DROP TYPE "payload"."enum_availability_status";
  DROP TYPE "payload"."enum_availability_source";`)
}
