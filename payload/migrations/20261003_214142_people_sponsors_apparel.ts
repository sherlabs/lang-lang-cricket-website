import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."player_sponsors" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"player_id" integer NOT NULL,
  	"sponsor_id" integer NOT NULL,
  	"season" varchar DEFAULT '',
  	"message" varchar DEFAULT '',
  	"featured" boolean DEFAULT false,
  	"sort_order" numeric DEFAULT 0,
  	"active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."club_apparel" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"apparel_url" varchar DEFAULT '',
  	"apparel_label" varchar DEFAULT 'Club apparel',
  	"apparel_blurb" varchar DEFAULT '',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload"."people" ADD COLUMN "player_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "player_sponsors_id" integer;
  ALTER TABLE "payload"."player_sponsors" ADD CONSTRAINT "player_sponsors_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "payload"."players"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."player_sponsors" ADD CONSTRAINT "player_sponsors_sponsor_id_sponsors_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "payload"."sponsors"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "player_sponsors_player_idx" ON "payload"."player_sponsors" USING btree ("player_id");
  CREATE INDEX "player_sponsors_sponsor_idx" ON "payload"."player_sponsors" USING btree ("sponsor_id");
  CREATE INDEX "player_sponsors_sort_order_idx" ON "payload"."player_sponsors" USING btree ("sort_order");
  CREATE INDEX "player_sponsors_active_idx" ON "payload"."player_sponsors" USING btree ("active");
  CREATE INDEX "player_sponsors_updated_at_idx" ON "payload"."player_sponsors" USING btree ("updated_at");
  CREATE INDEX "player_sponsors_created_at_idx" ON "payload"."player_sponsors" USING btree ("created_at");
  ALTER TABLE "payload"."people" ADD CONSTRAINT "people_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "payload"."players"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_player_sponsors_fk" FOREIGN KEY ("player_sponsors_id") REFERENCES "payload"."player_sponsors"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "people_player_idx" ON "payload"."people" USING btree ("player_id");
  CREATE INDEX "payload_locked_documents_rels_player_sponsors_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("player_sponsors_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."player_sponsors" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."club_apparel" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."player_sponsors" CASCADE;
  DROP TABLE "payload"."club_apparel" CASCADE;
  ALTER TABLE "payload"."people" DROP CONSTRAINT "people_player_id_players_id_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_player_sponsors_fk";
  
  DROP INDEX "payload"."people_player_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_player_sponsors_id_idx";
  ALTER TABLE "payload"."people" DROP COLUMN "player_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "player_sponsors_id";`)
}
