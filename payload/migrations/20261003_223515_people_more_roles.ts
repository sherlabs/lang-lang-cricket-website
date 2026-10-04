import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_people_more_roles_section" AS ENUM('leadership', 'committee', 'coach');
  CREATE TABLE "payload"."people_more_roles" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"role" varchar NOT NULL,
  	"section" "payload"."enum_people_more_roles_section" DEFAULT 'committee'
  );
  
  ALTER TABLE "payload"."people_more_roles" ADD CONSTRAINT "people_more_roles_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."people"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "people_more_roles_order_idx" ON "payload"."people_more_roles" USING btree ("_order");
  CREATE INDEX "people_more_roles_parent_id_idx" ON "payload"."people_more_roles" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."people_more_roles" CASCADE;
  DROP TYPE "payload"."enum_people_more_roles_section";`)
}
