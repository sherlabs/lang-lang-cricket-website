import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_users_facebook_id_via" AS ENUM('own', 'broker');
  CREATE TYPE "payload"."enum_site_settings_sign_in_mode" AS ENUM('off', 'broker', 'own-app');
  CREATE TABLE "payload"."auth_broker_jtis" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"jti" varchar NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  DROP INDEX "payload"."users_facebook_id_idx";
  ALTER TABLE "payload"."users" ADD COLUMN "facebook_id_via" "payload"."enum_users_facebook_id_via";
  UPDATE "payload"."users" SET "facebook_id_via" = 'own' WHERE "facebook_id" IS NOT NULL;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "auth_broker_jtis_id" integer;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "sign_in_mode" "payload"."enum_site_settings_sign_in_mode" DEFAULT 'broker';
  ALTER TABLE "payload"."site_settings" ADD COLUMN "sign_in_last_test_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "sign_in_last_test_ok" boolean;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "sign_in_last_test_summary" varchar;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "sign_in_last_event_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "sign_in_last_event_unlinked" numeric;
  CREATE UNIQUE INDEX "auth_broker_jtis_jti_idx" ON "payload"."auth_broker_jtis" USING btree ("jti");
  CREATE INDEX "auth_broker_jtis_expires_at_idx" ON "payload"."auth_broker_jtis" USING btree ("expires_at");
  CREATE INDEX "auth_broker_jtis_updated_at_idx" ON "payload"."auth_broker_jtis" USING btree ("updated_at");
  CREATE INDEX "auth_broker_jtis_created_at_idx" ON "payload"."auth_broker_jtis" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_auth_broker_jtis_fk" FOREIGN KEY ("auth_broker_jtis_id") REFERENCES "payload"."auth_broker_jtis"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "facebookId_facebookIdVia_idx" ON "payload"."users" USING btree ("facebook_id","facebook_id_via");
  CREATE INDEX "payload_locked_documents_rels_auth_broker_jtis_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("auth_broker_jtis_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."auth_broker_jtis" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."auth_broker_jtis" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_auth_broker_jtis_fk";
  
  DROP INDEX "payload"."facebookId_facebookIdVia_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_auth_broker_jtis_id_idx";
  CREATE UNIQUE INDEX "users_facebook_id_idx" ON "payload"."users" USING btree ("facebook_id");
  ALTER TABLE "payload"."users" DROP COLUMN "facebook_id_via";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "auth_broker_jtis_id";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "sign_in_mode";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "sign_in_last_test_at";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "sign_in_last_test_ok";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "sign_in_last_test_summary";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "sign_in_last_event_at";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "sign_in_last_event_unlinked";
  DROP TYPE "payload"."enum_users_facebook_id_via";
  DROP TYPE "payload"."enum_site_settings_sign_in_mode";`)
}
