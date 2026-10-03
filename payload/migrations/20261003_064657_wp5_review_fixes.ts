import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."players_honours" ALTER COLUMN "years" SET DEFAULT '';
  ALTER TABLE "payload"."players_honours" ALTER COLUMN "years" DROP NOT NULL;
  ALTER TABLE "payload"."players" ALTER COLUMN "last_name" SET DEFAULT '';
  ALTER TABLE "payload"."players" ALTER COLUMN "last_name" DROP NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."players_honours" ALTER COLUMN "years" DROP DEFAULT;
  ALTER TABLE "payload"."players_honours" ALTER COLUMN "years" SET NOT NULL;
  ALTER TABLE "payload"."players" ALTER COLUMN "last_name" DROP DEFAULT;
  ALTER TABLE "payload"."players" ALTER COLUMN "last_name" SET NOT NULL;`)
}
