import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_site_settings_stats_label_renames_kind" AS ENUM('grade', 'team', 'opponent');
  CREATE TABLE "payload"."site_settings_stats_label_renames" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kind" "payload"."enum_site_settings_stats_label_renames_kind" DEFAULT 'grade' NOT NULL,
  	"from" varchar NOT NULL,
  	"to" varchar NOT NULL
  );
  
  ALTER TABLE "payload"."players" ADD COLUMN "preferred_name" varchar;
  ALTER TABLE "payload"."site_settings_stats_label_renames" ADD CONSTRAINT "site_settings_stats_label_renames_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "site_settings_stats_label_renames_order_idx" ON "payload"."site_settings_stats_label_renames" USING btree ("_order");
  CREATE INDEX "site_settings_stats_label_renames_parent_id_idx" ON "payload"."site_settings_stats_label_renames" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."site_settings_stats_label_renames" CASCADE;
  ALTER TABLE "payload"."players" DROP COLUMN "preferred_name";
  DROP TYPE "payload"."enum_site_settings_stats_label_renames_kind";`)
}
