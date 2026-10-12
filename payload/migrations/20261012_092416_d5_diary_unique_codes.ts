import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   -- Keep the oldest row of any duplicated standard code and clear the code on the rest (no row is deleted), so the unique indexes can be built.
  UPDATE "payload"."diary_jobs" d SET "source_key" = NULL WHERE "source_key" IS NOT NULL AND "id" <> (SELECT MIN(x."id") FROM "payload"."diary_jobs" x WHERE x."season" = d."season" AND x."source_key" = d."source_key");
  UPDATE "payload"."plan_pillars" d SET "source_key" = NULL WHERE "source_key" IS NOT NULL AND "id" <> (SELECT MIN(x."id") FROM "payload"."plan_pillars" x WHERE x."source_key" = d."source_key");
  UPDATE "payload"."plan_objectives" d SET "source_key" = NULL WHERE "source_key" IS NOT NULL AND "id" <> (SELECT MIN(x."id") FROM "payload"."plan_objectives" x WHERE x."source_key" = d."source_key");
  DROP INDEX "payload"."plan_pillars_source_key_idx";
  DROP INDEX "payload"."plan_objectives_source_key_idx";
  CREATE UNIQUE INDEX "season_sourceKey_idx" ON "payload"."diary_jobs" USING btree ("season","source_key");
  CREATE UNIQUE INDEX "plan_pillars_source_key_idx" ON "payload"."plan_pillars" USING btree ("source_key");
  CREATE UNIQUE INDEX "plan_objectives_source_key_idx" ON "payload"."plan_objectives" USING btree ("source_key");
  -- An objective must always have a pillar: refuse to delete a pillar that still has objectives (it was "set null" on a NOT NULL column).
  ALTER TABLE "payload"."plan_objectives" DROP CONSTRAINT "plan_objectives_pillar_id_plan_pillars_id_fk";
  ALTER TABLE "payload"."plan_objectives" ADD CONSTRAINT "plan_objectives_pillar_id_plan_pillars_id_fk" FOREIGN KEY ("pillar_id") REFERENCES "payload"."plan_pillars"("id") ON DELETE restrict ON UPDATE no action;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "payload"."season_sourceKey_idx";
  DROP INDEX "payload"."plan_pillars_source_key_idx";
  DROP INDEX "payload"."plan_objectives_source_key_idx";
  CREATE INDEX "plan_pillars_source_key_idx" ON "payload"."plan_pillars" USING btree ("source_key");
  CREATE INDEX "plan_objectives_source_key_idx" ON "payload"."plan_objectives" USING btree ("source_key");
  ALTER TABLE "payload"."plan_objectives" DROP CONSTRAINT "plan_objectives_pillar_id_plan_pillars_id_fk";
  ALTER TABLE "payload"."plan_objectives" ADD CONSTRAINT "plan_objectives_pillar_id_plan_pillars_id_fk" FOREIGN KEY ("pillar_id") REFERENCES "payload"."plan_pillars"("id") ON DELETE set null ON UPDATE no action;`)
}
