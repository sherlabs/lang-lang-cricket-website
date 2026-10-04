import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_users_last_login_method" AS ENUM('password', 'facebook');
  ALTER TYPE "payload"."enum_users_role" ADD VALUE 'selector';
  ALTER TABLE "payload"."users" ADD COLUMN "disabled" boolean DEFAULT false;
  ALTER TABLE "payload"."users" ADD COLUMN "invite_token_hash" varchar;
  ALTER TABLE "payload"."users" ADD COLUMN "invite_expires_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."users" ADD COLUMN "invited_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."users" ADD COLUMN "facebook_id" varchar;
  ALTER TABLE "payload"."users" ADD COLUMN "facebook_linked_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."users" ADD COLUMN "last_login_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."users" ADD COLUMN "last_login_method" "payload"."enum_users_last_login_method";
  CREATE INDEX "users_disabled_idx" ON "payload"."users" USING btree ("disabled");
  CREATE INDEX "users_invite_token_hash_idx" ON "payload"."users" USING btree ("invite_token_hash");
  CREATE UNIQUE INDEX "users_facebook_id_idx" ON "payload"."users" USING btree ("facebook_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."users" ALTER COLUMN "role" SET DATA TYPE text;
  ALTER TABLE "payload"."users" ALTER COLUMN "role" SET DEFAULT 'editor'::text;
  DROP TYPE "payload"."enum_users_role";
  CREATE TYPE "payload"."enum_users_role" AS ENUM('admin', 'editor');
  ALTER TABLE "payload"."users" ALTER COLUMN "role" SET DEFAULT 'editor'::"payload"."enum_users_role";
  ALTER TABLE "payload"."users" ALTER COLUMN "role" SET DATA TYPE "payload"."enum_users_role" USING "role"::"payload"."enum_users_role";
  DROP INDEX "payload"."users_disabled_idx";
  DROP INDEX "payload"."users_invite_token_hash_idx";
  DROP INDEX "payload"."users_facebook_id_idx";
  ALTER TABLE "payload"."users" DROP COLUMN "disabled";
  ALTER TABLE "payload"."users" DROP COLUMN "invite_token_hash";
  ALTER TABLE "payload"."users" DROP COLUMN "invite_expires_at";
  ALTER TABLE "payload"."users" DROP COLUMN "invited_at";
  ALTER TABLE "payload"."users" DROP COLUMN "facebook_id";
  ALTER TABLE "payload"."users" DROP COLUMN "facebook_linked_at";
  ALTER TABLE "payload"."users" DROP COLUMN "last_login_at";
  ALTER TABLE "payload"."users" DROP COLUMN "last_login_method";
  DROP TYPE "payload"."enum_users_last_login_method";`)
}
