import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."event_rsvps" ALTER COLUMN "response" SET NOT NULL;
  ALTER TABLE "payload"."event_photos" ALTER COLUMN "status" SET NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."event_rsvps" ALTER COLUMN "response" DROP NOT NULL;
  ALTER TABLE "payload"."event_photos" ALTER COLUMN "status" DROP NOT NULL;`)
}
