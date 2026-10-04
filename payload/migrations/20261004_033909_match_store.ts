import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_matches_toss_choice" AS ENUM('bat', 'bowl');
  CREATE TYPE "payload"."enum_matches_result" AS ENUM('won', 'lost', 'draw', 'tie', 'no_result', 'abandoned');
  CREATE TYPE "payload"."enum_match_batting_batting_status" AS ENUM('out', 'not_out', 'did_not_bat', 'unknown');
  CREATE TYPE "payload"."enum_match_batting_dismissal_type" AS ENUM('bowled', 'caught', 'caught_and_bowled', 'lbw', 'stumped', 'run_out', 'hit_wicket', 'retired_hurt', 'retired', 'retired_out', 'other');
  CREATE TABLE "payload"."matches" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"game_id" varchar NOT NULL,
  	"status" varchar,
  	"type" varchar,
  	"season_name" varchar,
  	"season_start_year" numeric,
  	"competition_name" varchar,
  	"grade_id" varchar,
  	"grade_name" varchar,
  	"round_name" varchar,
  	"round_abbr" varchar,
  	"is_final_round" boolean,
  	"starts_at" timestamp(3) with time zone,
  	"local_date" varchar,
  	"days" numeric,
  	"venue_name" varchar,
  	"venue_suburb" varchar,
  	"club_team_id" varchar,
  	"club_team_name" varchar,
  	"opponent_team_id" varchar,
  	"opponent_name" varchar,
  	"opponent_org_id" varchar,
  	"opponent_org_name" varchar,
  	"is_home" boolean,
  	"toss_winner_team_id" varchar,
  	"toss_choice" "payload"."enum_matches_toss_choice",
  	"club_won_toss" boolean,
  	"club_outcome" varchar,
  	"opponent_outcome" varchar,
  	"result" "payload"."enum_matches_result",
  	"by_forfeit" boolean,
  	"on_first_innings" boolean,
  	"playhq_updated_at" varchar,
  	"source_hash" varchar,
  	"synced_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."match_innings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"match_id" integer NOT NULL,
  	"sequence_no" numeric NOT NULL,
  	"period_name" varchar,
  	"batting_team_id" varchar,
  	"bowling_team_id" varchar,
  	"is_club_batting" boolean,
  	"period_status" varchar,
  	"played" boolean,
  	"declared" boolean,
  	"all_out" boolean,
  	"total_runs" numeric,
  	"total_wickets" numeric,
  	"total_balls" numeric,
  	"extras_total" numeric,
  	"wides" numeric,
  	"no_balls" numeric,
  	"byes" numeric,
  	"leg_byes" numeric,
  	"penalty" numeric,
  	"has_fall_of_wickets" boolean,
  	"has_bowling_data" boolean,
  	"has_ball_data" boolean,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."match_appearances" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"match_id" integer NOT NULL,
  	"appearance_id" varchar NOT NULL,
  	"team_id" varchar,
  	"is_club_side" boolean,
  	"player_id" integer,
  	"name_key" varchar,
  	"display_name" varchar,
  	"captain_role" varchar,
  	"is_fill_in" boolean,
  	"is_registered_player" boolean,
  	"player_number" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."match_batting" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"innings_id" integer NOT NULL,
  	"match_id" integer NOT NULL,
  	"appearance_id" varchar NOT NULL,
  	"position" numeric,
  	"batting_status" "payload"."enum_match_batting_batting_status",
  	"runs" numeric,
  	"balls" numeric,
  	"fours" numeric,
  	"sixes" numeric,
  	"dismissal_type" "payload"."enum_match_batting_dismissal_type",
  	"bowler_appearance_id" varchar,
  	"fielder_appearance_id" varchar,
  	"fow_wicket" numeric,
  	"fow_runs" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."match_bowling" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"innings_id" integer NOT NULL,
  	"match_id" integer NOT NULL,
  	"appearance_id" varchar NOT NULL,
  	"order" numeric,
  	"balls" numeric,
  	"maidens" numeric,
  	"runs" numeric,
  	"wickets" numeric,
  	"wides" numeric,
  	"no_balls" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."match_fielding" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"innings_id" integer NOT NULL,
  	"match_id" integer NOT NULL,
  	"appearance_id" varchar NOT NULL,
  	"catches" numeric,
  	"keeper_catches" numeric,
  	"stumpings" numeric,
  	"run_outs_assisted" numeric,
  	"run_outs_unassisted" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."player_sync_runs" ADD COLUMN "matches_upserted" numeric DEFAULT 0;
  ALTER TABLE "payload"."player_sync_runs" ADD COLUMN "matches_skipped" numeric DEFAULT 0;
  ALTER TABLE "payload"."player_sync_runs" ADD COLUMN "match_mismatches" numeric DEFAULT 0;
  ALTER TABLE "payload"."player_sync_runs" ADD COLUMN "match_error" numeric DEFAULT 0;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "matches_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "match_innings_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "match_appearances_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "match_batting_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "match_bowling_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "match_fielding_id" integer;
  ALTER TABLE "payload"."match_innings" ADD CONSTRAINT "match_innings_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "payload"."matches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."match_appearances" ADD CONSTRAINT "match_appearances_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "payload"."matches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."match_appearances" ADD CONSTRAINT "match_appearances_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "payload"."players"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."match_batting" ADD CONSTRAINT "match_batting_innings_id_match_innings_id_fk" FOREIGN KEY ("innings_id") REFERENCES "payload"."match_innings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."match_batting" ADD CONSTRAINT "match_batting_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "payload"."matches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."match_bowling" ADD CONSTRAINT "match_bowling_innings_id_match_innings_id_fk" FOREIGN KEY ("innings_id") REFERENCES "payload"."match_innings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."match_bowling" ADD CONSTRAINT "match_bowling_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "payload"."matches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."match_fielding" ADD CONSTRAINT "match_fielding_innings_id_match_innings_id_fk" FOREIGN KEY ("innings_id") REFERENCES "payload"."match_innings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."match_fielding" ADD CONSTRAINT "match_fielding_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "payload"."matches"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "matches_game_id_idx" ON "payload"."matches" USING btree ("game_id");
  CREATE INDEX "matches_starts_at_idx" ON "payload"."matches" USING btree ("starts_at");
  CREATE INDEX "matches_updated_at_idx" ON "payload"."matches" USING btree ("updated_at");
  CREATE INDEX "matches_created_at_idx" ON "payload"."matches" USING btree ("created_at");
  CREATE INDEX "opponentOrgId_startsAt_idx" ON "payload"."matches" USING btree ("opponent_org_id","starts_at");
  CREATE INDEX "seasonStartYear_gradeId_idx" ON "payload"."matches" USING btree ("season_start_year","grade_id");
  CREATE INDEX "clubTeamId_startsAt_idx" ON "payload"."matches" USING btree ("club_team_id","starts_at");
  CREATE INDEX "status_startsAt_idx" ON "payload"."matches" USING btree ("status","starts_at");
  CREATE INDEX "match_innings_match_idx" ON "payload"."match_innings" USING btree ("match_id");
  CREATE INDEX "match_innings_updated_at_idx" ON "payload"."match_innings" USING btree ("updated_at");
  CREATE INDEX "match_innings_created_at_idx" ON "payload"."match_innings" USING btree ("created_at");
  CREATE UNIQUE INDEX "match_sequenceNo_idx" ON "payload"."match_innings" USING btree ("match_id","sequence_no");
  CREATE INDEX "match_appearances_match_idx" ON "payload"."match_appearances" USING btree ("match_id");
  CREATE INDEX "match_appearances_player_idx" ON "payload"."match_appearances" USING btree ("player_id");
  CREATE INDEX "match_appearances_name_key_idx" ON "payload"."match_appearances" USING btree ("name_key");
  CREATE INDEX "match_appearances_updated_at_idx" ON "payload"."match_appearances" USING btree ("updated_at");
  CREATE INDEX "match_appearances_created_at_idx" ON "payload"."match_appearances" USING btree ("created_at");
  CREATE UNIQUE INDEX "match_appearanceId_idx" ON "payload"."match_appearances" USING btree ("match_id","appearance_id");
  CREATE INDEX "player_match_idx" ON "payload"."match_appearances" USING btree ("player_id","match_id");
  CREATE INDEX "match_batting_innings_idx" ON "payload"."match_batting" USING btree ("innings_id");
  CREATE INDEX "match_batting_match_idx" ON "payload"."match_batting" USING btree ("match_id");
  CREATE INDEX "match_batting_updated_at_idx" ON "payload"."match_batting" USING btree ("updated_at");
  CREATE INDEX "match_batting_created_at_idx" ON "payload"."match_batting" USING btree ("created_at");
  CREATE UNIQUE INDEX "innings_appearanceId_idx" ON "payload"."match_batting" USING btree ("innings_id","appearance_id");
  CREATE INDEX "match_bowling_innings_idx" ON "payload"."match_bowling" USING btree ("innings_id");
  CREATE INDEX "match_bowling_match_idx" ON "payload"."match_bowling" USING btree ("match_id");
  CREATE INDEX "match_bowling_updated_at_idx" ON "payload"."match_bowling" USING btree ("updated_at");
  CREATE INDEX "match_bowling_created_at_idx" ON "payload"."match_bowling" USING btree ("created_at");
  CREATE UNIQUE INDEX "innings_appearanceId_1_idx" ON "payload"."match_bowling" USING btree ("innings_id","appearance_id");
  CREATE INDEX "match_fielding_innings_idx" ON "payload"."match_fielding" USING btree ("innings_id");
  CREATE INDEX "match_fielding_match_idx" ON "payload"."match_fielding" USING btree ("match_id");
  CREATE INDEX "match_fielding_updated_at_idx" ON "payload"."match_fielding" USING btree ("updated_at");
  CREATE INDEX "match_fielding_created_at_idx" ON "payload"."match_fielding" USING btree ("created_at");
  CREATE UNIQUE INDEX "innings_appearanceId_2_idx" ON "payload"."match_fielding" USING btree ("innings_id","appearance_id");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_matches_fk" FOREIGN KEY ("matches_id") REFERENCES "payload"."matches"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_match_innings_fk" FOREIGN KEY ("match_innings_id") REFERENCES "payload"."match_innings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_match_appearances_fk" FOREIGN KEY ("match_appearances_id") REFERENCES "payload"."match_appearances"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_match_batting_fk" FOREIGN KEY ("match_batting_id") REFERENCES "payload"."match_batting"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_match_bowling_fk" FOREIGN KEY ("match_bowling_id") REFERENCES "payload"."match_bowling"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_match_fielding_fk" FOREIGN KEY ("match_fielding_id") REFERENCES "payload"."match_fielding"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_matches_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("matches_id");
  CREATE INDEX "payload_locked_documents_rels_match_innings_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("match_innings_id");
  CREATE INDEX "payload_locked_documents_rels_match_appearances_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("match_appearances_id");
  CREATE INDEX "payload_locked_documents_rels_match_batting_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("match_batting_id");
  CREATE INDEX "payload_locked_documents_rels_match_bowling_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("match_bowling_id");
  CREATE INDEX "payload_locked_documents_rels_match_fielding_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("match_fielding_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."matches" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."match_innings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."match_appearances" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."match_batting" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."match_bowling" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."match_fielding" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."matches" CASCADE;
  DROP TABLE "payload"."match_innings" CASCADE;
  DROP TABLE "payload"."match_appearances" CASCADE;
  DROP TABLE "payload"."match_batting" CASCADE;
  DROP TABLE "payload"."match_bowling" CASCADE;
  DROP TABLE "payload"."match_fielding" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_matches_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_match_innings_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_match_appearances_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_match_batting_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_match_bowling_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_match_fielding_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_matches_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_match_innings_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_match_appearances_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_match_batting_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_match_bowling_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_match_fielding_id_idx";
  ALTER TABLE "payload"."player_sync_runs" DROP COLUMN "matches_upserted";
  ALTER TABLE "payload"."player_sync_runs" DROP COLUMN "matches_skipped";
  ALTER TABLE "payload"."player_sync_runs" DROP COLUMN "match_mismatches";
  ALTER TABLE "payload"."player_sync_runs" DROP COLUMN "match_error";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "matches_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "match_innings_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "match_appearances_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "match_batting_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "match_bowling_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "match_fielding_id";
  DROP TYPE "payload"."enum_matches_toss_choice";
  DROP TYPE "payload"."enum_matches_result";
  DROP TYPE "payload"."enum_match_batting_batting_status";
  DROP TYPE "payload"."enum_match_batting_dismissal_type";`)
}
