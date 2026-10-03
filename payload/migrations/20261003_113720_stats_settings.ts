import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_site_settings_stats_default_included_categories" AS ENUM('senior', 'junior', 'womens', 'masters', 'mixed');
  CREATE TYPE "payload"."enum_site_settings_stats_grade_rules_category" AS ENUM('senior', 'junior', 'womens', 'masters', 'mixed');
  CREATE TABLE "payload"."site_settings_stats_default_included_categories" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum_site_settings_stats_default_included_categories",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."site_settings_stats_grade_rules" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"category" "payload"."enum_site_settings_stats_grade_rules_category" NOT NULL,
  	"pattern" varchar NOT NULL,
  	"flags" varchar DEFAULT 'i'
  );
  
  CREATE TABLE "payload"."site_settings_stats_honour_categories" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."site_settings_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "payload"."site_settings_numbers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"number" numeric,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL
  );
  
  ALTER TABLE "payload"."club" ADD COLUMN "pages_stats_title" varchar DEFAULT 'Stats & Leaderboards';
  ALTER TABLE "payload"."club" ADD COLUMN "pages_stats_description" varchar DEFAULT 'Batting, bowling and fielding leaderboards for Lang Lang Cricket Club in Caldermeade, Victoria, by season and grade.';
  ALTER TABLE "payload"."club" ADD COLUMN "pages_records_title" varchar DEFAULT 'Club Records';
  ALTER TABLE "payload"."club" ADD COLUMN "pages_records_description" varchar DEFAULT 'Club batting, bowling and fielding records for Lang Lang Cricket Club, across every season on record.';
  ALTER TABLE "payload"."club" ADD COLUMN "pages_statlab_title" varchar DEFAULT 'StatLab';
  ALTER TABLE "payload"."club" ADD COLUMN "pages_statlab_description" varchar DEFAULT 'Build your own Lang Lang Cricket Club stats table: pick columns, filters and sorting, and export to CSV.';
  ALTER TABLE "payload"."site_settings" ADD COLUMN "stats_qualification_career_bat_avg_runs" numeric DEFAULT 300;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "stats_qualification_career_bat_avg_innings" numeric DEFAULT 8;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "stats_qualification_career_sr_balls" numeric DEFAULT 300;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "stats_qualification_career_bowl_avg_wickets" numeric DEFAULT 25;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "stats_qualification_career_econ_balls" numeric DEFAULT 300;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "stats_qualification_season_bat_avg_runs" numeric DEFAULT 100;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "stats_qualification_season_bat_avg_innings" numeric DEFAULT 5;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "stats_qualification_season_sr_balls" numeric DEFAULT 100;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "stats_qualification_season_bowl_avg_wickets" numeric DEFAULT 8;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "stats_qualification_season_econ_balls" numeric DEFAULT 120;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "stats_approach_window_games" numeric DEFAULT 5;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "stats_approach_window_runs" numeric DEFAULT 100;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "stats_approach_window_wickets" numeric DEFAULT 10;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "stats_approach_window_catches" numeric DEFAULT 5;
  ALTER TABLE "payload"."site_settings_stats_default_included_categories" ADD CONSTRAINT "site_settings_stats_default_included_categories_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."site_settings_stats_grade_rules" ADD CONSTRAINT "site_settings_stats_grade_rules_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."site_settings_stats_honour_categories" ADD CONSTRAINT "site_settings_stats_honour_categories_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."site_settings_texts" ADD CONSTRAINT "site_settings_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."site_settings_numbers" ADD CONSTRAINT "site_settings_numbers_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "site_settings_stats_default_included_categories_order_idx" ON "payload"."site_settings_stats_default_included_categories" USING btree ("order");
  CREATE INDEX "site_settings_stats_default_included_categories_parent_idx" ON "payload"."site_settings_stats_default_included_categories" USING btree ("parent_id");
  CREATE INDEX "site_settings_stats_grade_rules_order_idx" ON "payload"."site_settings_stats_grade_rules" USING btree ("_order");
  CREATE INDEX "site_settings_stats_grade_rules_parent_id_idx" ON "payload"."site_settings_stats_grade_rules" USING btree ("_parent_id");
  CREATE INDEX "site_settings_stats_honour_categories_order_idx" ON "payload"."site_settings_stats_honour_categories" USING btree ("_order");
  CREATE INDEX "site_settings_stats_honour_categories_parent_id_idx" ON "payload"."site_settings_stats_honour_categories" USING btree ("_parent_id");
  CREATE INDEX "site_settings_texts_order_parent" ON "payload"."site_settings_texts" USING btree ("order","parent_id");
  CREATE INDEX "site_settings_numbers_order_parent_idx" ON "payload"."site_settings_numbers" USING btree ("order","parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."site_settings_stats_default_included_categories" CASCADE;
  DROP TABLE "payload"."site_settings_stats_grade_rules" CASCADE;
  DROP TABLE "payload"."site_settings_stats_honour_categories" CASCADE;
  DROP TABLE "payload"."site_settings_texts" CASCADE;
  DROP TABLE "payload"."site_settings_numbers" CASCADE;
  ALTER TABLE "payload"."club" DROP COLUMN "pages_stats_title";
  ALTER TABLE "payload"."club" DROP COLUMN "pages_stats_description";
  ALTER TABLE "payload"."club" DROP COLUMN "pages_records_title";
  ALTER TABLE "payload"."club" DROP COLUMN "pages_records_description";
  ALTER TABLE "payload"."club" DROP COLUMN "pages_statlab_title";
  ALTER TABLE "payload"."club" DROP COLUMN "pages_statlab_description";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "stats_qualification_career_bat_avg_runs";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "stats_qualification_career_bat_avg_innings";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "stats_qualification_career_sr_balls";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "stats_qualification_career_bowl_avg_wickets";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "stats_qualification_career_econ_balls";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "stats_qualification_season_bat_avg_runs";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "stats_qualification_season_bat_avg_innings";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "stats_qualification_season_sr_balls";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "stats_qualification_season_bowl_avg_wickets";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "stats_qualification_season_econ_balls";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "stats_approach_window_games";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "stats_approach_window_runs";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "stats_approach_window_wickets";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "stats_approach_window_catches";
  DROP TYPE "payload"."enum_site_settings_stats_default_included_categories";
  DROP TYPE "payload"."enum_site_settings_stats_grade_rules_category";`)
}
