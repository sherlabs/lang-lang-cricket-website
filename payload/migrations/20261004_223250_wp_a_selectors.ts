import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_users_last_login_method" AS ENUM('password', 'facebook');
  ALTER TYPE "payload"."enum_users_role" ADD VALUE 'selector';
  CREATE TABLE "payload"."throttle_hits" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"count" numeric DEFAULT 0 NOT NULL,
  	"window_start" timestamp(3) with time zone NOT NULL,
  	"locked_until" timestamp(3) with time zone,
  	"strikes" numeric DEFAULT 0 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."users" ADD COLUMN "disabled" boolean DEFAULT false;
  ALTER TABLE "payload"."users" ADD COLUMN "invite_token_hash" varchar;
  ALTER TABLE "payload"."users" ADD COLUMN "invite_expires_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."users" ADD COLUMN "invited_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."users" ADD COLUMN "facebook_id" varchar;
  ALTER TABLE "payload"."users" ADD COLUMN "facebook_linked_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."users" ADD COLUMN "last_login_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."users" ADD COLUMN "last_login_method" "payload"."enum_users_last_login_method";
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "throttle_hits_id" integer;
  CREATE UNIQUE INDEX "throttle_hits_key_idx" ON "payload"."throttle_hits" USING btree ("key");
  CREATE INDEX "throttle_hits_updated_at_idx" ON "payload"."throttle_hits" USING btree ("updated_at");
  CREATE INDEX "throttle_hits_created_at_idx" ON "payload"."throttle_hits" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_throttle_hits_fk" FOREIGN KEY ("throttle_hits_id") REFERENCES "payload"."throttle_hits"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_disabled_idx" ON "payload"."users" USING btree ("disabled");
  CREATE INDEX "users_invite_token_hash_idx" ON "payload"."users" USING btree ("invite_token_hash");
  CREATE UNIQUE INDEX "users_facebook_id_idx" ON "payload"."users" USING btree ("facebook_id");
  CREATE INDEX "payload_locked_documents_rels_throttle_hits_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("throttle_hits_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."throttle_hits" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."throttle_hits" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_throttle_hits_fk";
  
  ALTER TABLE "payload"."users" ALTER COLUMN "role" SET DATA TYPE text;
  ALTER TABLE "payload"."users" ALTER COLUMN "role" SET DEFAULT 'editor'::text;
  DROP TYPE "payload"."enum_users_role";
  CREATE TYPE "payload"."enum_users_role" AS ENUM('admin', 'editor');
  ALTER TABLE "payload"."users" ALTER COLUMN "role" SET DEFAULT 'editor'::"payload"."enum_users_role";
  ALTER TABLE "payload"."users" ALTER COLUMN "role" SET DATA TYPE "payload"."enum_users_role" USING "role"::"payload"."enum_users_role";
  DROP INDEX "payload"."users_disabled_idx";
  DROP INDEX "payload"."users_invite_token_hash_idx";
  DROP INDEX "payload"."users_facebook_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_throttle_hits_id_idx";
  ALTER TABLE "payload"."users" DROP COLUMN "disabled";
  ALTER TABLE "payload"."users" DROP COLUMN "invite_token_hash";
  ALTER TABLE "payload"."users" DROP COLUMN "invite_expires_at";
  ALTER TABLE "payload"."users" DROP COLUMN "invited_at";
  ALTER TABLE "payload"."users" DROP COLUMN "facebook_id";
  ALTER TABLE "payload"."users" DROP COLUMN "facebook_linked_at";
  ALTER TABLE "payload"."users" DROP COLUMN "last_login_at";
  ALTER TABLE "payload"."users" DROP COLUMN "last_login_method";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "throttle_hits_id";
  DROP TYPE "payload"."enum_users_last_login_method";`)
}
