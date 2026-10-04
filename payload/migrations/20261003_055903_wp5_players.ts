import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_players_source" AS ENUM('playhq', 'manual');
  CREATE TYPE "payload"."enum_players_active_override" AS ENUM('active', 'past');
  CREATE TYPE "payload"."enum_player_sync_runs_status" AS ENUM('running', 'ok', 'error');
  CREATE TABLE "payload"."players_honours" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"years" varchar NOT NULL,
  	"title" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."players" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"first_name" varchar NOT NULL,
  	"last_name" varchar NOT NULL,
  	"display_name" varchar,
  	"slug" varchar,
  	"source" "payload"."enum_players_source" DEFAULT 'manual',
  	"photo_id" integer,
  	"bio" varchar DEFAULT '',
  	"manual_years" varchar DEFAULT '',
  	"active_override" "payload"."enum_players_active_override",
  	"is_active_derived" boolean DEFAULT false,
  	"hidden" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."player_aliases" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name_key" varchar NOT NULL,
  	"player_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."player_seasons" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"player_id" integer NOT NULL,
  	"season_name" varchar NOT NULL,
  	"season_order" numeric NOT NULL,
  	"team_id" varchar NOT NULL,
  	"team_name" varchar NOT NULL,
  	"grade_name" varchar,
  	"games" numeric DEFAULT 0 NOT NULL,
  	"bat_innings" numeric DEFAULT 0 NOT NULL,
  	"bat_not_outs" numeric DEFAULT 0 NOT NULL,
  	"bat_runs" numeric DEFAULT 0 NOT NULL,
  	"bat_high_score" numeric DEFAULT 0 NOT NULL,
  	"bat_balls" numeric DEFAULT 0 NOT NULL,
  	"bat_fours" numeric DEFAULT 0 NOT NULL,
  	"bat_sixes" numeric DEFAULT 0 NOT NULL,
  	"bowl_balls" numeric DEFAULT 0 NOT NULL,
  	"bowl_maidens" numeric DEFAULT 0 NOT NULL,
  	"bowl_runs" numeric DEFAULT 0 NOT NULL,
  	"bowl_wickets" numeric DEFAULT 0 NOT NULL,
  	"bowl_best_wickets" numeric DEFAULT 0 NOT NULL,
  	"bowl_best_runs" numeric DEFAULT 0 NOT NULL,
  	"catches" numeric DEFAULT 0 NOT NULL,
  	"bat_high_score_not_out" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."player_sync_runs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"started_at" timestamp(3) with time zone NOT NULL,
  	"finished_at" timestamp(3) with time zone,
  	"status" "payload"."enum_player_sync_runs_status",
  	"players_created" numeric DEFAULT 0,
  	"season_rows" numeric DEFAULT 0,
  	"error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "players_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "player_aliases_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "player_seasons_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "player_sync_runs_id" integer;
  ALTER TABLE "payload"."players_honours" ADD CONSTRAINT "players_honours_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."players"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."players" ADD CONSTRAINT "players_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."player_aliases" ADD CONSTRAINT "player_aliases_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "payload"."players"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."player_seasons" ADD CONSTRAINT "player_seasons_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "payload"."players"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "players_honours_order_idx" ON "payload"."players_honours" USING btree ("_order");
  CREATE INDEX "players_honours_parent_id_idx" ON "payload"."players_honours" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "players_slug_idx" ON "payload"."players" USING btree ("slug");
  CREATE INDEX "players_photo_idx" ON "payload"."players" USING btree ("photo_id");
  CREATE INDEX "players_hidden_idx" ON "payload"."players" USING btree ("hidden");
  CREATE INDEX "players_updated_at_idx" ON "payload"."players" USING btree ("updated_at");
  CREATE INDEX "players_created_at_idx" ON "payload"."players" USING btree ("created_at");
  CREATE UNIQUE INDEX "player_aliases_name_key_idx" ON "payload"."player_aliases" USING btree ("name_key");
  CREATE INDEX "player_aliases_player_idx" ON "payload"."player_aliases" USING btree ("player_id");
  CREATE INDEX "player_aliases_updated_at_idx" ON "payload"."player_aliases" USING btree ("updated_at");
  CREATE INDEX "player_aliases_created_at_idx" ON "payload"."player_aliases" USING btree ("created_at");
  CREATE INDEX "player_seasons_player_idx" ON "payload"."player_seasons" USING btree ("player_id");
  CREATE INDEX "player_seasons_season_order_idx" ON "payload"."player_seasons" USING btree ("season_order");
  CREATE INDEX "player_seasons_updated_at_idx" ON "payload"."player_seasons" USING btree ("updated_at");
  CREATE INDEX "player_seasons_created_at_idx" ON "payload"."player_seasons" USING btree ("created_at");
  CREATE UNIQUE INDEX "player_teamId_idx" ON "payload"."player_seasons" USING btree ("player_id","team_id");
  CREATE INDEX "player_sync_runs_status_idx" ON "payload"."player_sync_runs" USING btree ("status");
  CREATE INDEX "player_sync_runs_updated_at_idx" ON "payload"."player_sync_runs" USING btree ("updated_at");
  CREATE INDEX "player_sync_runs_created_at_idx" ON "payload"."player_sync_runs" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_players_fk" FOREIGN KEY ("players_id") REFERENCES "payload"."players"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_player_aliases_fk" FOREIGN KEY ("player_aliases_id") REFERENCES "payload"."player_aliases"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_player_seasons_fk" FOREIGN KEY ("player_seasons_id") REFERENCES "payload"."player_seasons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_player_sync_runs_fk" FOREIGN KEY ("player_sync_runs_id") REFERENCES "payload"."player_sync_runs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_players_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("players_id");
  CREATE INDEX "payload_locked_documents_rels_player_aliases_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("player_aliases_id");
  CREATE INDEX "payload_locked_documents_rels_player_seasons_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("player_seasons_id");
  CREATE INDEX "payload_locked_documents_rels_player_sync_runs_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("player_sync_runs_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."players_honours" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."players" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."player_aliases" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."player_seasons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."player_sync_runs" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."players_honours" CASCADE;
  DROP TABLE "payload"."players" CASCADE;
  DROP TABLE "payload"."player_aliases" CASCADE;
  DROP TABLE "payload"."player_seasons" CASCADE;
  DROP TABLE "payload"."player_sync_runs" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_players_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_player_aliases_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_player_seasons_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_player_sync_runs_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_players_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_player_aliases_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_player_seasons_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_player_sync_runs_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "players_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "player_aliases_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "player_seasons_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "player_sync_runs_id";
  DROP TYPE "payload"."enum_players_source";
  DROP TYPE "payload"."enum_players_active_override";
  DROP TYPE "payload"."enum_player_sync_runs_status";`)
}
