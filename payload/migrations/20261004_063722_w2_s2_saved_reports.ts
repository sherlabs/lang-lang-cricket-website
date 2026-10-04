import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."saved_reports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar,
  	"owner_id" integer,
  	"query" varchar NOT NULL,
  	"description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "saved_reports_id" integer;
  ALTER TABLE "payload"."saved_reports" ADD CONSTRAINT "saved_reports_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "saved_reports_slug_idx" ON "payload"."saved_reports" USING btree ("slug");
  CREATE INDEX "saved_reports_owner_idx" ON "payload"."saved_reports" USING btree ("owner_id");
  CREATE INDEX "saved_reports_updated_at_idx" ON "payload"."saved_reports" USING btree ("updated_at");
  CREATE INDEX "saved_reports_created_at_idx" ON "payload"."saved_reports" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_saved_reports_fk" FOREIGN KEY ("saved_reports_id") REFERENCES "payload"."saved_reports"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_saved_reports_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("saved_reports_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."saved_reports" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."saved_reports" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_saved_reports_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_saved_reports_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "saved_reports_id";`)
}
