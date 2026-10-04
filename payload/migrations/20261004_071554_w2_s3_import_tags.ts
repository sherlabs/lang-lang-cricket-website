import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_player_seasons_source" AS ENUM('playhq', 'import');
  CREATE TYPE "payload"."enum_matches_source" AS ENUM('playhq', 'import');
  ALTER TABLE "payload"."player_seasons" ADD COLUMN "source" "payload"."enum_player_seasons_source" DEFAULT 'playhq';
  ALTER TABLE "payload"."player_seasons" ADD COLUMN "import_batch" varchar;
  ALTER TABLE "payload"."player_seasons" ADD COLUMN "season_start_year" numeric;
  ALTER TABLE "payload"."matches" ADD COLUMN "source" "payload"."enum_matches_source" DEFAULT 'playhq';
  ALTER TABLE "payload"."matches" ADD COLUMN "import_batch" varchar;
  CREATE INDEX "player_seasons_source_idx" ON "payload"."player_seasons" USING btree ("source");
  CREATE INDEX "player_seasons_import_batch_idx" ON "payload"."player_seasons" USING btree ("import_batch");
  CREATE INDEX "matches_source_idx" ON "payload"."matches" USING btree ("source");
  CREATE INDEX "matches_import_batch_idx" ON "payload"."matches" USING btree ("import_batch");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "payload"."player_seasons_source_idx";
  DROP INDEX "payload"."player_seasons_import_batch_idx";
  DROP INDEX "payload"."matches_source_idx";
  DROP INDEX "payload"."matches_import_batch_idx";
  ALTER TABLE "payload"."player_seasons" DROP COLUMN "source";
  ALTER TABLE "payload"."player_seasons" DROP COLUMN "import_batch";
  ALTER TABLE "payload"."player_seasons" DROP COLUMN "season_start_year";
  ALTER TABLE "payload"."matches" DROP COLUMN "source";
  ALTER TABLE "payload"."matches" DROP COLUMN "import_batch";
  DROP TYPE "payload"."enum_player_seasons_source";
  DROP TYPE "payload"."enum_matches_source";`)
}
