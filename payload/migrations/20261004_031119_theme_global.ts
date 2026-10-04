import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_theme_heading_font" AS ENUM('barlow-condensed', 'oswald', 'bebas-neue', 'anton', 'playfair-display');
  CREATE TABLE "payload"."theme" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"palette_primary" varchar NOT NULL,
  	"palette_accent" varchar NOT NULL,
  	"palette_surface" varchar NOT NULL,
  	"palette_text" varchar NOT NULL,
  	"palette_muted" varchar NOT NULL,
  	"shades_ink" varchar NOT NULL,
  	"shades_accent_dark" varchar NOT NULL,
  	"shades_accent_light" varchar NOT NULL,
  	"shades_accent_pale" varchar NOT NULL,
  	"shades_accent_deep" varchar NOT NULL,
  	"shades_surface_muted" varchar NOT NULL,
  	"shades_muted_light" varchar NOT NULL,
  	"crest_id" integer,
  	"heading_font" "payload"."enum_theme_heading_font" NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload"."theme" ADD CONSTRAINT "theme_crest_id_media_id_fk" FOREIGN KEY ("crest_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "theme_crest_idx" ON "payload"."theme" USING btree ("crest_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."theme" CASCADE;
  DROP TYPE "payload"."enum_theme_heading_font";`)
}
