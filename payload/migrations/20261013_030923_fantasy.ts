import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_fantasy_seasons_status" AS ENUM('draft', 'open', 'closed');
  CREATE TABLE "payload"."fantasy_seasons" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"season_start_year" numeric NOT NULL,
  	"name" varchar NOT NULL,
  	"status" "payload"."enum_fantasy_seasons_status" DEFAULT 'draft' NOT NULL,
  	"opened_at" timestamp(3) with time zone,
  	"max_entries" numeric DEFAULT 300,
  	"squad_size" numeric DEFAULT 11,
  	"salary_cap_tenths" numeric DEFAULT 1000,
  	"captain_multiplier" numeric DEFAULT 2,
  	"transfers_per_round" numeric DEFAULT 3,
  	"min_price_tenths" numeric DEFAULT 40,
  	"max_price_tenths" numeric DEFAULT 140,
  	"price_seasons_back" numeric DEFAULT 2,
  	"prior_games" numeric DEFAULT 3,
  	"min_games_for_price" numeric DEFAULT 3,
  	"scoring_appearance" numeric DEFAULT 2,
  	"scoring_run" numeric DEFAULT 1,
  	"scoring_four" numeric DEFAULT 1,
  	"scoring_six" numeric DEFAULT 2,
  	"scoring_fifty" numeric DEFAULT 8,
  	"scoring_hundred" numeric DEFAULT 16,
  	"scoring_duck" numeric DEFAULT -3,
  	"scoring_wicket" numeric DEFAULT 20,
  	"scoring_maiden" numeric DEFAULT 6,
  	"scoring_three_wickets" numeric DEFAULT 6,
  	"scoring_five_wickets" numeric DEFAULT 12,
  	"scoring_catch" numeric DEFAULT 8,
  	"scoring_stumping" numeric DEFAULT 12,
  	"scoring_run_out" numeric DEFAULT 10,
  	"admin_log" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."fantasy_seasons_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "payload"."fantasy_round_state" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"season_id" integer NOT NULL,
  	"weekend_key" varchar NOT NULL,
  	"locks_at" timestamp(3) with time zone,
  	"lock_override" timestamp(3) with time zone,
  	"scored_manually" boolean DEFAULT false,
  	"scored_reason" varchar,
  	"scored_by_id" integer,
  	"scored_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."fantasy_prices" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"season_id" integer NOT NULL,
  	"player_id" integer NOT NULL,
  	"price_tenths" numeric NOT NULL,
  	"auto_price_tenths" numeric NOT NULL,
  	"overridden" boolean DEFAULT false,
  	"available" boolean DEFAULT true,
  	"basis" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."fantasy_entries" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"season_id" integer NOT NULL,
  	"team_name" varchar NOT NULL,
  	"name_key" varchar NOT NULL,
  	"pin_hash" varchar,
  	"pin_salt" varchar,
  	"pin_set_at" timestamp(3) with time zone,
  	"must_change_pin" boolean DEFAULT false,
  	"device_code_hash" varchar,
  	"device_code_expires" timestamp(3) with time zone,
  	"disabled" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."fantasy_squads_picks" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"player_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."fantasy_squads" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"entry_id" integer NOT NULL,
  	"round" varchar NOT NULL,
  	"captain_id" integer,
  	"spent_tenths" numeric DEFAULT 0 NOT NULL,
  	"transfers_used" numeric DEFAULT 0 NOT NULL,
  	"saved_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "fantasy_seasons_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "fantasy_round_state_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "fantasy_prices_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "fantasy_entries_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "fantasy_squads_id" integer;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "fantasy_enabled" boolean DEFAULT false;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "fantasy_public_leaderboard" boolean DEFAULT false;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "fantasy_competition_name" varchar DEFAULT 'Fantasy cricket';
  ALTER TABLE "payload"."site_settings" ADD COLUMN "fantasy_link_version" numeric DEFAULT 1;
  ALTER TABLE "payload"."fantasy_seasons_texts" ADD CONSTRAINT "fantasy_seasons_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."fantasy_seasons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."fantasy_round_state" ADD CONSTRAINT "fantasy_round_state_season_id_fantasy_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "payload"."fantasy_seasons"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."fantasy_round_state" ADD CONSTRAINT "fantasy_round_state_scored_by_id_users_id_fk" FOREIGN KEY ("scored_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."fantasy_prices" ADD CONSTRAINT "fantasy_prices_season_id_fantasy_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "payload"."fantasy_seasons"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."fantasy_prices" ADD CONSTRAINT "fantasy_prices_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "payload"."players"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."fantasy_entries" ADD CONSTRAINT "fantasy_entries_season_id_fantasy_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "payload"."fantasy_seasons"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."fantasy_squads_picks" ADD CONSTRAINT "fantasy_squads_picks_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "payload"."players"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."fantasy_squads_picks" ADD CONSTRAINT "fantasy_squads_picks_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."fantasy_squads"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."fantasy_squads" ADD CONSTRAINT "fantasy_squads_entry_id_fantasy_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "payload"."fantasy_entries"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."fantasy_squads" ADD CONSTRAINT "fantasy_squads_captain_id_players_id_fk" FOREIGN KEY ("captain_id") REFERENCES "payload"."players"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "fantasy_seasons_season_start_year_idx" ON "payload"."fantasy_seasons" USING btree ("season_start_year");
  CREATE INDEX "fantasy_seasons_status_idx" ON "payload"."fantasy_seasons" USING btree ("status");
  CREATE INDEX "fantasy_seasons_updated_at_idx" ON "payload"."fantasy_seasons" USING btree ("updated_at");
  CREATE INDEX "fantasy_seasons_created_at_idx" ON "payload"."fantasy_seasons" USING btree ("created_at");
  CREATE INDEX "fantasy_seasons_texts_order_parent" ON "payload"."fantasy_seasons_texts" USING btree ("order","parent_id");
  CREATE INDEX "fantasy_round_state_season_idx" ON "payload"."fantasy_round_state" USING btree ("season_id");
  CREATE INDEX "fantasy_round_state_scored_by_idx" ON "payload"."fantasy_round_state" USING btree ("scored_by_id");
  CREATE INDEX "fantasy_round_state_updated_at_idx" ON "payload"."fantasy_round_state" USING btree ("updated_at");
  CREATE INDEX "fantasy_round_state_created_at_idx" ON "payload"."fantasy_round_state" USING btree ("created_at");
  CREATE UNIQUE INDEX "season_weekendKey_idx" ON "payload"."fantasy_round_state" USING btree ("season_id","weekend_key");
  CREATE INDEX "fantasy_prices_season_idx" ON "payload"."fantasy_prices" USING btree ("season_id");
  CREATE INDEX "fantasy_prices_player_idx" ON "payload"."fantasy_prices" USING btree ("player_id");
  CREATE INDEX "fantasy_prices_updated_at_idx" ON "payload"."fantasy_prices" USING btree ("updated_at");
  CREATE INDEX "fantasy_prices_created_at_idx" ON "payload"."fantasy_prices" USING btree ("created_at");
  CREATE UNIQUE INDEX "season_player_idx" ON "payload"."fantasy_prices" USING btree ("season_id","player_id");
  CREATE INDEX "fantasy_entries_season_idx" ON "payload"."fantasy_entries" USING btree ("season_id");
  CREATE INDEX "fantasy_entries_updated_at_idx" ON "payload"."fantasy_entries" USING btree ("updated_at");
  CREATE INDEX "fantasy_entries_created_at_idx" ON "payload"."fantasy_entries" USING btree ("created_at");
  CREATE UNIQUE INDEX "season_nameKey_idx" ON "payload"."fantasy_entries" USING btree ("season_id","name_key");
  CREATE INDEX "fantasy_squads_picks_order_idx" ON "payload"."fantasy_squads_picks" USING btree ("_order");
  CREATE INDEX "fantasy_squads_picks_parent_id_idx" ON "payload"."fantasy_squads_picks" USING btree ("_parent_id");
  CREATE INDEX "fantasy_squads_picks_player_idx" ON "payload"."fantasy_squads_picks" USING btree ("player_id");
  CREATE INDEX "fantasy_squads_entry_idx" ON "payload"."fantasy_squads" USING btree ("entry_id");
  CREATE INDEX "fantasy_squads_captain_idx" ON "payload"."fantasy_squads" USING btree ("captain_id");
  CREATE INDEX "fantasy_squads_updated_at_idx" ON "payload"."fantasy_squads" USING btree ("updated_at");
  CREATE INDEX "fantasy_squads_created_at_idx" ON "payload"."fantasy_squads" USING btree ("created_at");
  CREATE UNIQUE INDEX "entry_round_idx" ON "payload"."fantasy_squads" USING btree ("entry_id","round");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_fantasy_seasons_fk" FOREIGN KEY ("fantasy_seasons_id") REFERENCES "payload"."fantasy_seasons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_fantasy_round_state_fk" FOREIGN KEY ("fantasy_round_state_id") REFERENCES "payload"."fantasy_round_state"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_fantasy_prices_fk" FOREIGN KEY ("fantasy_prices_id") REFERENCES "payload"."fantasy_prices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_fantasy_entries_fk" FOREIGN KEY ("fantasy_entries_id") REFERENCES "payload"."fantasy_entries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_fantasy_squads_fk" FOREIGN KEY ("fantasy_squads_id") REFERENCES "payload"."fantasy_squads"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_fantasy_seasons_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("fantasy_seasons_id");
  CREATE INDEX "payload_locked_documents_rels_fantasy_round_state_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("fantasy_round_state_id");
  CREATE INDEX "payload_locked_documents_rels_fantasy_prices_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("fantasy_prices_id");
  CREATE INDEX "payload_locked_documents_rels_fantasy_entries_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("fantasy_entries_id");
  CREATE INDEX "payload_locked_documents_rels_fantasy_squads_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("fantasy_squads_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."fantasy_seasons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."fantasy_seasons_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."fantasy_round_state" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."fantasy_prices" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."fantasy_entries" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."fantasy_squads_picks" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."fantasy_squads" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."fantasy_seasons" CASCADE;
  DROP TABLE "payload"."fantasy_seasons_texts" CASCADE;
  DROP TABLE "payload"."fantasy_round_state" CASCADE;
  DROP TABLE "payload"."fantasy_prices" CASCADE;
  DROP TABLE "payload"."fantasy_entries" CASCADE;
  DROP TABLE "payload"."fantasy_squads_picks" CASCADE;
  DROP TABLE "payload"."fantasy_squads" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_fantasy_seasons_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_fantasy_round_state_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_fantasy_prices_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_fantasy_entries_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_fantasy_squads_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_fantasy_seasons_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_fantasy_round_state_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_fantasy_prices_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_fantasy_entries_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_fantasy_squads_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "fantasy_seasons_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "fantasy_round_state_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "fantasy_prices_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "fantasy_entries_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "fantasy_squads_id";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "fantasy_enabled";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "fantasy_public_leaderboard";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "fantasy_competition_name";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "fantasy_link_version";
  DROP TYPE "payload"."enum_fantasy_seasons_status";`)
}
