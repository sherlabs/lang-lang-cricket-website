import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."fee_seasons" ADD COLUMN "idempotency_key" varchar;
  ALTER TABLE "payload"."fee_charges" ADD COLUMN "idempotency_key" varchar;
  ALTER TABLE "payload"."fee_waivers" ADD COLUMN "idempotency_key" varchar;
  CREATE UNIQUE INDEX "fee_seasons_idempotency_key_idx" ON "payload"."fee_seasons" USING btree ("idempotency_key");
  CREATE UNIQUE INDEX "fee_charges_idempotency_key_idx" ON "payload"."fee_charges" USING btree ("idempotency_key");
  CREATE UNIQUE INDEX "fee_waivers_idempotency_key_idx" ON "payload"."fee_waivers" USING btree ("idempotency_key");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "payload"."fee_seasons_idempotency_key_idx";
  DROP INDEX "payload"."fee_charges_idempotency_key_idx";
  DROP INDEX "payload"."fee_waivers_idempotency_key_idx";
  ALTER TABLE "payload"."fee_seasons" DROP COLUMN "idempotency_key";
  ALTER TABLE "payload"."fee_charges" DROP COLUMN "idempotency_key";
  ALTER TABLE "payload"."fee_waivers" DROP COLUMN "idempotency_key";`)
}
