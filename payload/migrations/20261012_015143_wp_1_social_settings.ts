import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_social_settings_sponsor_strip_tiers" AS ENUM('Platinum', 'Gold', 'Silver', 'Bronze', 'Player');
  CREATE TYPE "payload"."enum_social_settings_default_style" AS ENUM('bold', 'classic', 'minimal');
  CREATE TABLE "payload"."social_settings_sponsor_strip_tiers" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum_social_settings_sponsor_strip_tiers",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."social_settings_hashtags" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tag" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."social_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"default_style" "payload"."enum_social_settings_default_style" DEFAULT 'bold',
  	"sponsor_strip_show" boolean DEFAULT true,
  	"sponsor_strip_max" numeric DEFAULT 5,
  	"show_site_host" boolean DEFAULT true,
  	"attribution" varchar,
  	"caption_templates_result" varchar,
  	"caption_templates_fixtures" varchar,
  	"caption_templates_lineup" varchar,
  	"caption_templates_potm" varchar,
  	"caption_templates_milestone" varchar,
  	"caption_templates_stats_leaders" varchar,
  	"caption_templates_event_promo" varchar,
  	"caption_templates_sponsor_thanks" varchar,
  	"caption_templates_season_wrap" varchar,
  	"sign_off" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload"."players" ADD COLUMN "is_junior" boolean DEFAULT false;
  ALTER TABLE "payload"."players" ADD COLUMN "social_opt_in" boolean DEFAULT false;
  ALTER TABLE "payload"."social_settings_sponsor_strip_tiers" ADD CONSTRAINT "social_settings_sponsor_strip_tiers_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."social_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."social_settings_hashtags" ADD CONSTRAINT "social_settings_hashtags_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."social_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "social_settings_sponsor_strip_tiers_order_idx" ON "payload"."social_settings_sponsor_strip_tiers" USING btree ("order");
  CREATE INDEX "social_settings_sponsor_strip_tiers_parent_idx" ON "payload"."social_settings_sponsor_strip_tiers" USING btree ("parent_id");
  CREATE INDEX "social_settings_hashtags_order_idx" ON "payload"."social_settings_hashtags" USING btree ("_order");
  CREATE INDEX "social_settings_hashtags_parent_id_idx" ON "payload"."social_settings_hashtags" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."social_settings_sponsor_strip_tiers" CASCADE;
  DROP TABLE "payload"."social_settings_hashtags" CASCADE;
  DROP TABLE "payload"."social_settings" CASCADE;
  ALTER TABLE "payload"."players" DROP COLUMN "is_junior";
  ALTER TABLE "payload"."players" DROP COLUMN "social_opt_in";
  DROP TYPE "payload"."enum_social_settings_sponsor_strip_tiers";
  DROP TYPE "payload"."enum_social_settings_default_style";`)
}
