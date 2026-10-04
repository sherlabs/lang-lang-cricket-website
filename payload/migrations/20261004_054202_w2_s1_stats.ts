import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."player_seasons" ADD COLUMN "bat_runs_unballed" numeric DEFAULT 0 NOT NULL;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "stats_match_minimums_opposition_innings" numeric DEFAULT 3;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "stats_match_minimums_opposition_balls" numeric DEFAULT 72;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "stats_match_minimums_position_innings" numeric DEFAULT 5;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "stats_match_minimums_rate_innings" numeric DEFAULT 10;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "stats_match_minimums_win_games" numeric DEFAULT 10;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "stats_match_minimums_balls_for_boundary" numeric DEFAULT 100;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "stats_match_minimums_partnership_pair_games" numeric DEFAULT 2;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."player_seasons" DROP COLUMN "bat_runs_unballed";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "stats_match_minimums_opposition_innings";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "stats_match_minimums_opposition_balls";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "stats_match_minimums_position_innings";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "stats_match_minimums_rate_innings";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "stats_match_minimums_win_games";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "stats_match_minimums_balls_for_boundary";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "stats_match_minimums_partnership_pair_games";`)
}
