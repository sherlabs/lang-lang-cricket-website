import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_email_campaigns_status" AS ENUM('draft', 'sending', 'sent', 'cancelled');
  CREATE TYPE "payload"."enum_email_recipients_status" AS ENUM('queued', 'sending', 'sent', 'failed', 'skipped-suppressed', 'skipped-no-email');
  CREATE TYPE "payload"."enum_email_suppressions_reason" AS ENUM('unsubscribed', 'manual', 'bounced', 'complaint');
  CREATE TABLE "payload"."email_campaigns" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"subject" varchar NOT NULL,
  	"body" varchar NOT NULL,
  	"audience" jsonb,
  	"status" "payload"."enum_email_campaigns_status" DEFAULT 'draft' NOT NULL,
  	"counts_queued" numeric DEFAULT 0,
  	"counts_sent" numeric DEFAULT 0,
  	"counts_failed" numeric DEFAULT 0,
  	"counts_skipped" numeric DEFAULT 0,
  	"created_by_id" integer,
  	"sent_at" timestamp(3) with time zone,
  	"recipients_purged_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."email_recipients" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"campaign_id" integer NOT NULL,
  	"member_id" integer,
  	"email" varchar,
  	"email_hash" varchar NOT NULL,
  	"first_name" varchar,
  	"status" "payload"."enum_email_recipients_status" DEFAULT 'queued' NOT NULL,
  	"attempts" numeric DEFAULT 0,
  	"claim_token" varchar,
  	"claimed_at" timestamp(3) with time zone,
  	"next_attempt_at" timestamp(3) with time zone,
  	"provider_id" varchar,
  	"error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."email_suppressions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"email_hash" varchar NOT NULL,
  	"email" varchar,
  	"reason" "payload"."enum_email_suppressions_reason" NOT NULL,
  	"source" varchar,
  	"at" timestamp(3) with time zone NOT NULL,
  	"campaign_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "email_campaigns_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "email_recipients_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "email_suppressions_id" integer;
  ALTER TABLE "payload"."office_settings" ADD COLUMN "email_footer" varchar DEFAULT 'You are receiving this because you are connected with {clubName}. Contact: {contact}';
  ALTER TABLE "payload"."office_settings" ADD COLUMN "unsubscribe_text" varchar DEFAULT 'You can stop these emails at any time.';
  ALTER TABLE "payload"."office_settings" ADD COLUMN "compliance_text" varchar;
  ALTER TABLE "payload"."office_settings" ADD COLUMN "recipient_retention_days" numeric DEFAULT 30;
  ALTER TABLE "payload"."email_campaigns" ADD CONSTRAINT "email_campaigns_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."email_recipients" ADD CONSTRAINT "email_recipients_campaign_id_email_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "payload"."email_campaigns"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."email_recipients" ADD CONSTRAINT "email_recipients_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "payload"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."email_suppressions" ADD CONSTRAINT "email_suppressions_campaign_id_email_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "payload"."email_campaigns"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "email_campaigns_status_idx" ON "payload"."email_campaigns" USING btree ("status");
  CREATE INDEX "email_campaigns_created_by_idx" ON "payload"."email_campaigns" USING btree ("created_by_id");
  CREATE INDEX "email_campaigns_updated_at_idx" ON "payload"."email_campaigns" USING btree ("updated_at");
  CREATE INDEX "email_campaigns_created_at_idx" ON "payload"."email_campaigns" USING btree ("created_at");
  CREATE INDEX "email_recipients_campaign_idx" ON "payload"."email_recipients" USING btree ("campaign_id");
  CREATE INDEX "email_recipients_member_idx" ON "payload"."email_recipients" USING btree ("member_id");
  CREATE INDEX "email_recipients_email_hash_idx" ON "payload"."email_recipients" USING btree ("email_hash");
  CREATE INDEX "email_recipients_status_idx" ON "payload"."email_recipients" USING btree ("status");
  CREATE INDEX "email_recipients_updated_at_idx" ON "payload"."email_recipients" USING btree ("updated_at");
  CREATE INDEX "email_recipients_created_at_idx" ON "payload"."email_recipients" USING btree ("created_at");
  CREATE UNIQUE INDEX "campaign_email_idx" ON "payload"."email_recipients" USING btree ("campaign_id","email");
  CREATE UNIQUE INDEX "email_suppressions_email_hash_idx" ON "payload"."email_suppressions" USING btree ("email_hash");
  CREATE INDEX "email_suppressions_campaign_idx" ON "payload"."email_suppressions" USING btree ("campaign_id");
  CREATE INDEX "email_suppressions_updated_at_idx" ON "payload"."email_suppressions" USING btree ("updated_at");
  CREATE INDEX "email_suppressions_created_at_idx" ON "payload"."email_suppressions" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_email_campaigns_fk" FOREIGN KEY ("email_campaigns_id") REFERENCES "payload"."email_campaigns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_email_recipients_fk" FOREIGN KEY ("email_recipients_id") REFERENCES "payload"."email_recipients"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_email_suppressions_fk" FOREIGN KEY ("email_suppressions_id") REFERENCES "payload"."email_suppressions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_email_campaigns_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("email_campaigns_id");
  CREATE INDEX "payload_locked_documents_rels_email_recipients_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("email_recipients_id");
  CREATE INDEX "payload_locked_documents_rels_email_suppressions_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("email_suppressions_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."email_campaigns" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."email_recipients" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."email_suppressions" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."email_campaigns" CASCADE;
  DROP TABLE "payload"."email_recipients" CASCADE;
  DROP TABLE "payload"."email_suppressions" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_email_campaigns_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_email_recipients_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_email_suppressions_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_email_campaigns_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_email_recipients_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_email_suppressions_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "email_campaigns_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "email_recipients_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "email_suppressions_id";
  ALTER TABLE "payload"."office_settings" DROP COLUMN "email_footer";
  ALTER TABLE "payload"."office_settings" DROP COLUMN "unsubscribe_text";
  ALTER TABLE "payload"."office_settings" DROP COLUMN "compliance_text";
  ALTER TABLE "payload"."office_settings" DROP COLUMN "recipient_retention_days";
  DROP TYPE "payload"."enum_email_campaigns_status";
  DROP TYPE "payload"."enum_email_recipients_status";
  DROP TYPE "payload"."enum_email_suppressions_reason";`)
}
