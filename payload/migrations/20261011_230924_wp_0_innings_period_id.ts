import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."match_innings" ADD COLUMN "period_id" varchar;
  ALTER TABLE "payload"."match_innings" ADD COLUMN "playhq_sequence_no" numeric;
  CREATE UNIQUE INDEX "match_periodId_idx" ON "payload"."match_innings" USING btree ("match_id","period_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "payload"."match_periodId_idx";
  ALTER TABLE "payload"."match_innings" DROP COLUMN "period_id";
  ALTER TABLE "payload"."match_innings" DROP COLUMN "playhq_sequence_no";`)
}
