import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_selection_fixtures_votes_state" AS ENUM('auto', 'open', 'closed');
  CREATE TYPE "payload"."enum_best_player_ballots_source" AS ENUM('voter', 'selector');
  CREATE TYPE "payload"."enum_selection_settings_votes_public_scope" AS ENUM('club', 'grade', 'both');
  CREATE TABLE "payload"."best_player_ballots_picks" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"place" numeric NOT NULL,
  	"player_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."best_player_ballots" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"fixture_id" integer NOT NULL,
  	"voter_key" varchar NOT NULL,
  	"voter_id" integer,
  	"source" "payload"."enum_best_player_ballots_source" DEFAULT 'voter' NOT NULL,
  	"cast_by_id" integer,
  	"cast_at" timestamp(3) with time zone,
  	"edited_at" timestamp(3) with time zone,
  	"revision" numeric DEFAULT 1,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."selection_fixtures" ADD COLUMN "votes_state" "payload"."enum_selection_fixtures_votes_state" DEFAULT 'auto';
  ALTER TABLE "payload"."selection_fixtures" ADD COLUMN "counts_for_awards" boolean DEFAULT true;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "best_player_ballots_id" integer;
  ALTER TABLE "payload"."selection_settings" ADD COLUMN "votes_enabled" boolean DEFAULT false;
  ALTER TABLE "payload"."selection_settings" ADD COLUMN "votes_allow_self_vote" boolean DEFAULT false;
  ALTER TABLE "payload"."selection_settings" ADD COLUMN "votes_ballot_values" varchar DEFAULT '3,2,1';
  ALTER TABLE "payload"."selection_settings" ADD COLUMN "votes_tie_break_fewest_games" boolean DEFAULT false;
  ALTER TABLE "payload"."selection_settings" ADD COLUMN "votes_vote_window_days" numeric DEFAULT 7;
  ALTER TABLE "payload"."selection_settings" ADD COLUMN "votes_edit_window_hours" numeric DEFAULT 24;
  ALTER TABLE "payload"."selection_settings" ADD COLUMN "votes_min_ballots_to_count" numeric DEFAULT 5;
  ALTER TABLE "payload"."selection_settings" ADD COLUMN "votes_public_leaderboard" boolean DEFAULT false;
  ALTER TABLE "payload"."selection_settings" ADD COLUMN "votes_public_scope" "payload"."enum_selection_settings_votes_public_scope" DEFAULT 'club';
  ALTER TABLE "payload"."selection_settings" ADD COLUMN "votes_public_show_breakdown" boolean DEFAULT true;
  ALTER TABLE "payload"."best_player_ballots_picks" ADD CONSTRAINT "best_player_ballots_picks_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "payload"."players"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."best_player_ballots_picks" ADD CONSTRAINT "best_player_ballots_picks_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."best_player_ballots"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."best_player_ballots" ADD CONSTRAINT "best_player_ballots_fixture_id_selection_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "payload"."selection_fixtures"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."best_player_ballots" ADD CONSTRAINT "best_player_ballots_voter_id_players_id_fk" FOREIGN KEY ("voter_id") REFERENCES "payload"."players"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."best_player_ballots" ADD CONSTRAINT "best_player_ballots_cast_by_id_users_id_fk" FOREIGN KEY ("cast_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "best_player_ballots_picks_order_idx" ON "payload"."best_player_ballots_picks" USING btree ("_order");
  CREATE INDEX "best_player_ballots_picks_parent_id_idx" ON "payload"."best_player_ballots_picks" USING btree ("_parent_id");
  CREATE INDEX "best_player_ballots_picks_player_idx" ON "payload"."best_player_ballots_picks" USING btree ("player_id");
  CREATE INDEX "best_player_ballots_fixture_idx" ON "payload"."best_player_ballots" USING btree ("fixture_id");
  CREATE INDEX "best_player_ballots_voter_idx" ON "payload"."best_player_ballots" USING btree ("voter_id");
  CREATE INDEX "best_player_ballots_cast_by_idx" ON "payload"."best_player_ballots" USING btree ("cast_by_id");
  CREATE INDEX "best_player_ballots_updated_at_idx" ON "payload"."best_player_ballots" USING btree ("updated_at");
  CREATE INDEX "best_player_ballots_created_at_idx" ON "payload"."best_player_ballots" USING btree ("created_at");
  CREATE UNIQUE INDEX "fixture_voterKey_idx" ON "payload"."best_player_ballots" USING btree ("fixture_id","voter_key");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_best_player_ballots_fk" FOREIGN KEY ("best_player_ballots_id") REFERENCES "payload"."best_player_ballots"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_best_player_ballots_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("best_player_ballots_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."best_player_ballots_picks" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."best_player_ballots" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."best_player_ballots_picks" CASCADE;
  DROP TABLE "payload"."best_player_ballots" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_best_player_ballots_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_best_player_ballots_id_idx";
  ALTER TABLE "payload"."selection_fixtures" DROP COLUMN "votes_state";
  ALTER TABLE "payload"."selection_fixtures" DROP COLUMN "counts_for_awards";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "best_player_ballots_id";
  ALTER TABLE "payload"."selection_settings" DROP COLUMN "votes_enabled";
  ALTER TABLE "payload"."selection_settings" DROP COLUMN "votes_allow_self_vote";
  ALTER TABLE "payload"."selection_settings" DROP COLUMN "votes_ballot_values";
  ALTER TABLE "payload"."selection_settings" DROP COLUMN "votes_tie_break_fewest_games";
  ALTER TABLE "payload"."selection_settings" DROP COLUMN "votes_vote_window_days";
  ALTER TABLE "payload"."selection_settings" DROP COLUMN "votes_edit_window_hours";
  ALTER TABLE "payload"."selection_settings" DROP COLUMN "votes_min_ballots_to_count";
  ALTER TABLE "payload"."selection_settings" DROP COLUMN "votes_public_leaderboard";
  ALTER TABLE "payload"."selection_settings" DROP COLUMN "votes_public_scope";
  ALTER TABLE "payload"."selection_settings" DROP COLUMN "votes_public_show_breakdown";
  DROP TYPE "payload"."enum_selection_fixtures_votes_state";
  DROP TYPE "payload"."enum_best_player_ballots_source";
  DROP TYPE "payload"."enum_selection_settings_votes_public_scope";`)
}
