import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_members_roles" AS ENUM('player', 'parent', 'life-member', 'volunteer', 'sponsor-contact', 'committee', 'coach', 'supporter', 'other');
  CREATE TYPE "payload"."enum_members_status" AS ENUM('active', 'past');
  CREATE TYPE "payload"."enum_members_imported_from" AS ENUM('manual', 'players', 'csv');
  CREATE TYPE "payload"."enum_office_audit_log_action" AS ENUM('export', 'email-send', 'erase', 'bulk-change');
  CREATE TABLE "payload"."members_roles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum_members_roles",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."members" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"display_name" varchar,
  	"player_id" integer,
  	"person_id" integer,
  	"first_name" varchar,
  	"last_name" varchar,
  	"preferred_name" varchar,
  	"status" "payload"."enum_members_status" DEFAULT 'active' NOT NULL,
  	"membership_since" timestamp(3) with time zone,
  	"life_member_since" numeric,
  	"email" varchar,
  	"phone" varchar,
  	"address_line" varchar,
  	"locality" varchar,
  	"region" varchar,
  	"postal_code" varchar,
  	"date_of_birth" timestamp(3) with time zone,
  	"emergency_contact_name" varchar,
  	"emergency_contact_phone" varchar,
  	"emergency_contact_relationship" varchar,
  	"do_not_email" boolean DEFAULT false,
  	"notes" varchar,
  	"erased_at" timestamp(3) with time zone,
  	"imported_from" "payload"."enum_members_imported_from" DEFAULT 'manual',
  	"volunteer_link_version" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."members_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"members_id" integer
  );
  
  CREATE TABLE "payload"."office_audit_log" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"at" timestamp(3) with time zone NOT NULL,
  	"user_id" integer,
  	"action" "payload"."enum_office_audit_log_action" NOT NULL,
  	"module" varchar NOT NULL,
  	"summary" jsonb,
  	"row_count" numeric,
  	"included_sensitive" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."office_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"currency" varchar,
  	"locale" varchar,
  	"address_labels_address_line" varchar DEFAULT 'Street address',
  	"address_labels_locality" varchar DEFAULT 'Locality',
  	"address_labels_region" varchar DEFAULT 'Region',
  	"address_labels_postal_code" varchar DEFAULT 'Postal code',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "members_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "office_audit_log_id" integer;
  ALTER TABLE "payload"."members_roles" ADD CONSTRAINT "members_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."members" ADD CONSTRAINT "members_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "payload"."players"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."members" ADD CONSTRAINT "members_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "payload"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."members_rels" ADD CONSTRAINT "members_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."members_rels" ADD CONSTRAINT "members_rels_members_fk" FOREIGN KEY ("members_id") REFERENCES "payload"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."office_audit_log" ADD CONSTRAINT "office_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "members_roles_order_idx" ON "payload"."members_roles" USING btree ("order");
  CREATE INDEX "members_roles_parent_idx" ON "payload"."members_roles" USING btree ("parent_id");
  CREATE INDEX "members_display_name_idx" ON "payload"."members" USING btree ("display_name");
  CREATE UNIQUE INDEX "members_player_idx" ON "payload"."members" USING btree ("player_id");
  CREATE INDEX "members_person_idx" ON "payload"."members" USING btree ("person_id");
  CREATE INDEX "members_status_idx" ON "payload"."members" USING btree ("status");
  CREATE INDEX "members_email_idx" ON "payload"."members" USING btree ("email");
  CREATE INDEX "members_updated_at_idx" ON "payload"."members" USING btree ("updated_at");
  CREATE INDEX "members_created_at_idx" ON "payload"."members" USING btree ("created_at");
  CREATE INDEX "members_rels_order_idx" ON "payload"."members_rels" USING btree ("order");
  CREATE INDEX "members_rels_parent_idx" ON "payload"."members_rels" USING btree ("parent_id");
  CREATE INDEX "members_rels_path_idx" ON "payload"."members_rels" USING btree ("path");
  CREATE INDEX "members_rels_members_id_idx" ON "payload"."members_rels" USING btree ("members_id");
  CREATE INDEX "office_audit_log_at_idx" ON "payload"."office_audit_log" USING btree ("at");
  CREATE INDEX "office_audit_log_user_idx" ON "payload"."office_audit_log" USING btree ("user_id");
  CREATE INDEX "office_audit_log_updated_at_idx" ON "payload"."office_audit_log" USING btree ("updated_at");
  CREATE INDEX "office_audit_log_created_at_idx" ON "payload"."office_audit_log" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_members_fk" FOREIGN KEY ("members_id") REFERENCES "payload"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_office_audit_log_fk" FOREIGN KEY ("office_audit_log_id") REFERENCES "payload"."office_audit_log"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_members_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("members_id");
  CREATE INDEX "payload_locked_documents_rels_office_audit_log_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("office_audit_log_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."members_roles" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."members" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."members_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."office_audit_log" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."office_settings" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."members_roles" CASCADE;
  DROP TABLE "payload"."members" CASCADE;
  DROP TABLE "payload"."members_rels" CASCADE;
  DROP TABLE "payload"."office_audit_log" CASCADE;
  DROP TABLE "payload"."office_settings" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_members_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_office_audit_log_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_members_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_office_audit_log_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "members_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "office_audit_log_id";
  DROP TYPE "payload"."enum_members_roles";
  DROP TYPE "payload"."enum_members_status";
  DROP TYPE "payload"."enum_members_imported_from";
  DROP TYPE "payload"."enum_office_audit_log_action";`)
}
