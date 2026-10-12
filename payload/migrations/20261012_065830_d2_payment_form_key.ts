import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."fee_payments" ADD COLUMN "idempotency_key" varchar;
  CREATE UNIQUE INDEX "fee_payments_idempotency_key_idx" ON "payload"."fee_payments" USING btree ("idempotency_key");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "payload"."fee_payments_idempotency_key_idx";
  ALTER TABLE "payload"."fee_payments" DROP COLUMN "idempotency_key";`)
}
