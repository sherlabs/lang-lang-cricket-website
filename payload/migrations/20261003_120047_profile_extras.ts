import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."players" ADD COLUMN "baseline_games" numeric DEFAULT 0;
  ALTER TABLE "payload"."players" ADD COLUMN "baseline_runs" numeric DEFAULT 0;
  ALTER TABLE "payload"."players" ADD COLUMN "baseline_wickets" numeric DEFAULT 0;
  ALTER TABLE "payload"."players" ADD COLUMN "baseline_catches" numeric DEFAULT 0;
  ALTER TABLE "payload"."club" ADD COLUMN "pages_honours_title" varchar DEFAULT 'Honour Board';
  ALTER TABLE "payload"."club" ADD COLUMN "pages_honours_description" varchar DEFAULT 'Life members, premiership players, best and fairest winners and other honours at Lang Lang Cricket Club.';
  ALTER TABLE "payload"."club" ADD COLUMN "pages_compare_title" varchar DEFAULT 'Compare Players';
  ALTER TABLE "payload"."club" ADD COLUMN "pages_compare_description" varchar DEFAULT 'Compare two Lang Lang Cricket Club players side by side: batting, bowling and fielding.';`)

  // One-time reserved-slug check: /players/compare is a static route, so a player whose slug is
  // "compare" (ETL-created or added by hand) would be unreachable. Rename it, and fail loudly
  // rather than guess if the replacement slug is taken too.
  await db.execute(sql`
  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM "payload"."players" WHERE "slug" = 'compare') THEN
      IF EXISTS (SELECT 1 FROM "payload"."players" WHERE "slug" = 'compare-2') THEN
        RAISE EXCEPTION 'players.slug "compare" is reserved and "compare-2" is already taken: rename one of them by hand, then re-run the migration';
      END IF;
      UPDATE "payload"."players" SET "slug" = 'compare-2' WHERE "slug" = 'compare';
    END IF;
  END $$;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."players" DROP COLUMN "baseline_games";
  ALTER TABLE "payload"."players" DROP COLUMN "baseline_runs";
  ALTER TABLE "payload"."players" DROP COLUMN "baseline_wickets";
  ALTER TABLE "payload"."players" DROP COLUMN "baseline_catches";
  ALTER TABLE "payload"."club" DROP COLUMN "pages_honours_title";
  ALTER TABLE "payload"."club" DROP COLUMN "pages_honours_description";
  ALTER TABLE "payload"."club" DROP COLUMN "pages_compare_title";
  ALTER TABLE "payload"."club" DROP COLUMN "pages_compare_description";`)
}
