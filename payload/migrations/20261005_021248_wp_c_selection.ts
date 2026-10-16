import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."team_sheets_slots" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"player_id" integer,
  	"guest_name" varchar,
  	"order" numeric NOT NULL,
  	"is_captain" boolean DEFAULT false,
  	"is_keeper" boolean DEFAULT false
  );
  
  CREATE TABLE "payload"."team_sheets" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"fixture_id" integer NOT NULL,
  	"size" numeric DEFAULT 11,
  	"marked_ready" boolean DEFAULT false,
  	"notes" varchar,
  	"revision" numeric DEFAULT 0,
  	"updated_by_id" integer,
  	"published_snapshot" jsonb,
  	"published_at" timestamp(3) with time zone,
  	"published_by_id" integer,
  	"publish_count" numeric DEFAULT 0,
  	"announcement_id" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."announcements" ADD COLUMN "link" varchar;
  ALTER TABLE "payload"."announcements" ADD COLUMN "link_label" varchar;
  ALTER TABLE "payload"."announcements" ADD COLUMN "auto_key" varchar;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "team_sheets_id" integer;
  ALTER TABLE "payload"."club" ADD COLUMN "teams_sign_off" varchar DEFAULT '';
  ALTER TABLE "payload"."site_settings" ADD COLUMN "matchday_label" varchar DEFAULT 'Matchday';
  ALTER TABLE "payload"."selection_settings" ADD COLUMN "default_xi_size" numeric DEFAULT 11;
  ALTER TABLE "payload"."selection_settings" ADD COLUMN "publish_batting_order" boolean DEFAULT true;
  ALTER TABLE "payload"."selection_settings" ADD COLUMN "announce_on_publish" boolean DEFAULT true;
  ALTER TABLE "payload"."team_sheets_slots" ADD CONSTRAINT "team_sheets_slots_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "payload"."players"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."team_sheets_slots" ADD CONSTRAINT "team_sheets_slots_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."team_sheets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."team_sheets" ADD CONSTRAINT "team_sheets_fixture_id_selection_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "payload"."selection_fixtures"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."team_sheets" ADD CONSTRAINT "team_sheets_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."team_sheets" ADD CONSTRAINT "team_sheets_published_by_id_users_id_fk" FOREIGN KEY ("published_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "team_sheets_slots_order_idx" ON "payload"."team_sheets_slots" USING btree ("_order");
  CREATE INDEX "team_sheets_slots_parent_id_idx" ON "payload"."team_sheets_slots" USING btree ("_parent_id");
  CREATE INDEX "team_sheets_slots_player_idx" ON "payload"."team_sheets_slots" USING btree ("player_id");
  CREATE UNIQUE INDEX "team_sheets_fixture_idx" ON "payload"."team_sheets" USING btree ("fixture_id");
  CREATE INDEX "team_sheets_updated_by_idx" ON "payload"."team_sheets" USING btree ("updated_by_id");
  CREATE INDEX "team_sheets_published_by_idx" ON "payload"."team_sheets" USING btree ("published_by_id");
  CREATE INDEX "team_sheets_updated_at_idx" ON "payload"."team_sheets" USING btree ("updated_at");
  CREATE INDEX "team_sheets_created_at_idx" ON "payload"."team_sheets" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_team_sheets_fk" FOREIGN KEY ("team_sheets_id") REFERENCES "payload"."team_sheets"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "announcements_auto_key_idx" ON "payload"."announcements" USING btree ("auto_key");
  CREATE INDEX "payload_locked_documents_rels_team_sheets_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("team_sheets_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."team_sheets_slots" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."team_sheets" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."team_sheets_slots" CASCADE;
  DROP TABLE "payload"."team_sheets" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_team_sheets_fk";
  
  DROP INDEX "payload"."announcements_auto_key_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_team_sheets_id_idx";
  ALTER TABLE "payload"."announcements" DROP COLUMN "link";
  ALTER TABLE "payload"."announcements" DROP COLUMN "link_label";
  ALTER TABLE "payload"."announcements" DROP COLUMN "auto_key";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "team_sheets_id";
  ALTER TABLE "payload"."club" DROP COLUMN "teams_sign_off";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "matchday_label";
  ALTER TABLE "payload"."selection_settings" DROP COLUMN "default_xi_size";
  ALTER TABLE "payload"."selection_settings" DROP COLUMN "publish_batting_order";
  ALTER TABLE "payload"."selection_settings" DROP COLUMN "announce_on_publish";`)
}
