import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."selection_settings" ADD COLUMN "xi_min_bowlers" numeric DEFAULT 5;
  ALTER TABLE "payload"."selection_settings" ADD COLUMN "xi_min_batters" numeric DEFAULT 5;
  ALTER TABLE "payload"."selection_settings" ADD COLUMN "xi_require_keeper" boolean DEFAULT true;
  ALTER TABLE "payload"."selection_settings" ADD COLUMN "xi_treat_no_answer_as_maybe" boolean DEFAULT true;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."selection_settings" DROP COLUMN "xi_min_bowlers";
  ALTER TABLE "payload"."selection_settings" DROP COLUMN "xi_min_batters";
  ALTER TABLE "payload"."selection_settings" DROP COLUMN "xi_require_keeper";
  ALTER TABLE "payload"."selection_settings" DROP COLUMN "xi_treat_no_answer_as_maybe";`)
}
