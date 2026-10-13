import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."selection_settings" ADD COLUMN "scouting_show_opposition_names" boolean DEFAULT true;
  ALTER TABLE "payload"."selection_settings" ADD COLUMN "scouting_min_innings" numeric DEFAULT 2;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."selection_settings" DROP COLUMN "scouting_show_opposition_names";
  ALTER TABLE "payload"."selection_settings" DROP COLUMN "scouting_min_innings";`)
}
