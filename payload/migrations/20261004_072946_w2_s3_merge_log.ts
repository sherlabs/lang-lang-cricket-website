import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_merge_log_kind" AS ENUM('merge', 'dismissed');
  CREATE TYPE "payload"."enum_merge_log_status" AS ENUM('applied', 'undone', 'dismissed');
  CREATE TABLE "payload"."merge_log" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"kind" "payload"."enum_merge_log_kind" NOT NULL,
  	"status" "payload"."enum_merge_log_status" NOT NULL,
  	"source_player_id" numeric NOT NULL,
  	"source_name" varchar,
  	"target_player_id" integer,
  	"snapshot" jsonb,
  	"created_by_id" integer,
  	"undone_at" timestamp(3) with time zone,
  	"undone_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "merge_log_id" integer;
  ALTER TABLE "payload"."merge_log" ADD CONSTRAINT "merge_log_target_player_id_players_id_fk" FOREIGN KEY ("target_player_id") REFERENCES "payload"."players"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."merge_log" ADD CONSTRAINT "merge_log_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."merge_log" ADD CONSTRAINT "merge_log_undone_by_id_users_id_fk" FOREIGN KEY ("undone_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "merge_log_kind_idx" ON "payload"."merge_log" USING btree ("kind");
  CREATE INDEX "merge_log_status_idx" ON "payload"."merge_log" USING btree ("status");
  CREATE INDEX "merge_log_source_player_id_idx" ON "payload"."merge_log" USING btree ("source_player_id");
  CREATE INDEX "merge_log_target_player_idx" ON "payload"."merge_log" USING btree ("target_player_id");
  CREATE INDEX "merge_log_created_by_idx" ON "payload"."merge_log" USING btree ("created_by_id");
  CREATE INDEX "merge_log_undone_by_idx" ON "payload"."merge_log" USING btree ("undone_by_id");
  CREATE INDEX "merge_log_updated_at_idx" ON "payload"."merge_log" USING btree ("updated_at");
  CREATE INDEX "merge_log_created_at_idx" ON "payload"."merge_log" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_merge_log_fk" FOREIGN KEY ("merge_log_id") REFERENCES "payload"."merge_log"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_merge_log_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("merge_log_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."merge_log" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."merge_log" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_merge_log_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_merge_log_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "merge_log_id";
  DROP TYPE "payload"."enum_merge_log_kind";
  DROP TYPE "payload"."enum_merge_log_status";`)
}
