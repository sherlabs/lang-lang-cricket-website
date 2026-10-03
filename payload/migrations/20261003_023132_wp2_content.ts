import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_documents_category" AS ENUM('Codes of Conduct', 'Policies', 'Child Safety', 'Game Day', 'CCCA Directory');
  CREATE TYPE "payload"."enum_sponsors_tier" AS ENUM('Platinum', 'Gold', 'Silver', 'Bronze', 'Player');
  CREATE TYPE "payload"."enum_people_section" AS ENUM('leadership', 'committee', 'coach');
  CREATE TYPE "payload"."enum_club_socials_platform" AS ENUM('facebook', 'instagram', 'x', 'youtube', 'tiktok');
  CREATE TYPE "payload"."enum_site_settings_sponsor_carousel_tiers" AS ENUM('Platinum', 'Gold', 'Silver', 'Bronze', 'Player');
  CREATE TABLE "payload"."documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"category" "payload"."enum_documents_category" NOT NULL,
  	"legacy_url" varchar,
  	"prefix" varchar DEFAULT 'documents',
  	"_objectkey" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "payload"."gallery_photos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"caption" varchar DEFAULT '',
  	"sort_order" numeric DEFAULT 0,
  	"legacy_url" varchar,
  	"prefix" varchar DEFAULT 'gallery',
  	"_objectkey" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "payload"."sponsors" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"tier" "payload"."enum_sponsors_tier" DEFAULT 'Bronze' NOT NULL,
  	"logo_id" integer,
  	"link_url" varchar DEFAULT '',
  	"sort_order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."people" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"role" varchar NOT NULL,
  	"section" "payload"."enum_people_section" DEFAULT 'committee',
  	"phone" varchar DEFAULT '',
  	"email" varchar DEFAULT '',
  	"photo_id" integer,
  	"sort_order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."announcements" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"body" varchar DEFAULT '',
  	"published" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."club_socials" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"platform" "payload"."enum_club_socials_platform" NOT NULL,
  	"url" varchar DEFAULT '',
  	"label" varchar DEFAULT ''
  );
  
  CREATE TABLE "payload"."club" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar DEFAULT 'Lang Lang Cricket Club' NOT NULL,
  	"short_name" varchar DEFAULT 'Lang Lang CC',
  	"tagline" varchar DEFAULT 'Caldermeade, Victoria',
  	"sport" varchar DEFAULT 'Cricket',
  	"site_url" varchar DEFAULT 'https://langlangcricketclub.com',
  	"logo_id" integer,
  	"locale" varchar DEFAULT 'en-AU',
  	"og_locale" varchar DEFAULT 'en_AU',
  	"email" varchar DEFAULT 'langlangcricketclub@gmail.com',
  	"sponsorship_subject" varchar DEFAULT 'Sponsorship enquiry',
  	"address_locality" varchar DEFAULT 'Caldermeade',
  	"address_region" varchar DEFAULT 'VIC',
  	"address_region_name" varchar DEFAULT 'Victoria',
  	"address_country" varchar DEFAULT 'AU',
  	"address_country_name" varchar DEFAULT 'Australia',
  	"map_query" varchar DEFAULT 'Caldermeade, Victoria, Australia',
  	"default_title" varchar DEFAULT 'Lang Lang Cricket Club',
  	"title_suffix" varchar DEFAULT ' | Lang Lang Cricket Club',
  	"default_description" varchar DEFAULT 'Lang Lang Cricket Club — junior and senior cricket in Caldermeade, Victoria. A welcoming community club for beginners through to experienced players.',
  	"og_image_id" integer,
  	"og_image_alt" varchar DEFAULT 'Lang Lang Cricket Club clubrooms and oval at Caldermeade',
  	"pages_home_title" varchar DEFAULT '',
  	"pages_home_description" varchar DEFAULT '',
  	"pages_sponsors_title" varchar DEFAULT 'Sponsors',
  	"pages_sponsors_description" varchar DEFAULT 'The local businesses and supporters who back Lang Lang Cricket Club in Caldermeade, Victoria.',
  	"pages_gallery_title" varchar DEFAULT 'Gallery',
  	"pages_gallery_description" varchar DEFAULT 'Photos from match days, presentations and club life at Lang Lang Cricket Club in Caldermeade, Victoria.',
  	"pages_documents_title" varchar DEFAULT 'Documents & Policies',
  	"pages_documents_description" varchar DEFAULT 'Codes of conduct, child safety, game day information and policies for members and families of Lang Lang Cricket Club.',
  	"pages_contact_title" varchar DEFAULT 'Contact',
  	"pages_contact_description" varchar DEFAULT 'Get in touch with Lang Lang Cricket Club in Caldermeade, Victoria, for playing, sponsorship and general enquiries.',
  	"pages_people_title" varchar DEFAULT 'Our People',
  	"pages_people_description" varchar DEFAULT 'Meet the coaches, committee and volunteers who keep Lang Lang Cricket Club in Caldermeade, Victoria running.',
  	"pages_announcements_title" varchar DEFAULT 'Announcements',
  	"pages_announcements_description" varchar DEFAULT 'Latest news and notices from Lang Lang Cricket Club in Caldermeade, Victoria.',
  	"pages_history_title" varchar DEFAULT 'History',
  	"pages_history_description" varchar DEFAULT 'Stories, memories and milestones from the long history of Lang Lang Cricket Club in Caldermeade, Victoria.',
  	"pages_history_submit_title" varchar DEFAULT 'Share your story',
  	"pages_history_submit_description" varchar DEFAULT 'Share your memories of Lang Lang Cricket Club in Caldermeade and help us preserve our history.',
  	"pages_events_title" varchar DEFAULT 'Events',
  	"pages_events_description" varchar DEFAULT 'Upcoming club events, training, and how to RSVP.',
  	"pages_players_title" varchar DEFAULT 'Players',
  	"pages_players_description" varchar DEFAULT 'Current and past players of Lang Lang Cricket Club in Caldermeade, Victoria, with career stats and club honours.',
  	"pages_fixtures_title" varchar DEFAULT 'Fixtures, Results & Teams',
  	"pages_fixtures_description" varchar DEFAULT 'Fixtures, results and teams for Lang Lang Cricket Club in Caldermeade, Victoria, across every grade and season.',
  	"history_narrative" varchar DEFAULT 'Much of the club''s written record had faded or gone missing over the decades. In the 2022–23 season that changed: through the work of the Club Committee, the club''s history records were restored and brought back into the clubrooms.

Those records now sit alongside a modern home ground in Caldermeade, developed with the support of Cardinia Shire Council and Community Bank Lang Lang, giving the next generation of juniors and seniors a place to add their own chapter.',
  	"history_pull_quote" varchar DEFAULT 'You cannot make history without knowing where you started.',
  	"history_callout_eyebrow" varchar DEFAULT 'With thanks',
  	"history_callout_title" varchar DEFAULT 'The Club Committee',
  	"history_callout_body" varchar DEFAULT 'For restoring the club''s history records in 2022–23.',
  	"story_submit_intro" varchar DEFAULT 'Old photos, scorebooks, match reports, memories from the clubrooms — tell us your Lang Lang story. A committee member reviews every submission before it appears on the site.',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload"."site_settings_sponsor_carousel_tiers" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum_site_settings_sponsor_carousel_tiers",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."site_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "documents_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "gallery_photos_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "sponsors_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "people_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "announcements_id" integer;
  ALTER TABLE "payload"."sponsors" ADD CONSTRAINT "sponsors_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."people" ADD CONSTRAINT "people_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."club_socials" ADD CONSTRAINT "club_socials_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."club"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."club" ADD CONSTRAINT "club_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."club" ADD CONSTRAINT "club_og_image_id_media_id_fk" FOREIGN KEY ("og_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."site_settings_sponsor_carousel_tiers" ADD CONSTRAINT "site_settings_sponsor_carousel_tiers_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "documents_legacy_url_idx" ON "payload"."documents" USING btree ("legacy_url");
  CREATE INDEX "documents_updated_at_idx" ON "payload"."documents" USING btree ("updated_at");
  CREATE INDEX "documents_created_at_idx" ON "payload"."documents" USING btree ("created_at");
  CREATE UNIQUE INDEX "documents_filename_idx" ON "payload"."documents" USING btree ("filename");
  CREATE INDEX "gallery_photos_sort_order_idx" ON "payload"."gallery_photos" USING btree ("sort_order");
  CREATE UNIQUE INDEX "gallery_photos_legacy_url_idx" ON "payload"."gallery_photos" USING btree ("legacy_url");
  CREATE INDEX "gallery_photos_updated_at_idx" ON "payload"."gallery_photos" USING btree ("updated_at");
  CREATE INDEX "gallery_photos_created_at_idx" ON "payload"."gallery_photos" USING btree ("created_at");
  CREATE UNIQUE INDEX "gallery_photos_filename_idx" ON "payload"."gallery_photos" USING btree ("filename");
  CREATE INDEX "sponsors_logo_idx" ON "payload"."sponsors" USING btree ("logo_id");
  CREATE INDEX "sponsors_sort_order_idx" ON "payload"."sponsors" USING btree ("sort_order");
  CREATE INDEX "sponsors_updated_at_idx" ON "payload"."sponsors" USING btree ("updated_at");
  CREATE INDEX "sponsors_created_at_idx" ON "payload"."sponsors" USING btree ("created_at");
  CREATE INDEX "people_photo_idx" ON "payload"."people" USING btree ("photo_id");
  CREATE INDEX "people_sort_order_idx" ON "payload"."people" USING btree ("sort_order");
  CREATE INDEX "people_updated_at_idx" ON "payload"."people" USING btree ("updated_at");
  CREATE INDEX "people_created_at_idx" ON "payload"."people" USING btree ("created_at");
  CREATE INDEX "announcements_published_idx" ON "payload"."announcements" USING btree ("published");
  CREATE INDEX "announcements_updated_at_idx" ON "payload"."announcements" USING btree ("updated_at");
  CREATE INDEX "announcements_created_at_idx" ON "payload"."announcements" USING btree ("created_at");
  CREATE INDEX "club_socials_order_idx" ON "payload"."club_socials" USING btree ("_order");
  CREATE INDEX "club_socials_parent_id_idx" ON "payload"."club_socials" USING btree ("_parent_id");
  CREATE INDEX "club_logo_idx" ON "payload"."club" USING btree ("logo_id");
  CREATE INDEX "club_og_image_idx" ON "payload"."club" USING btree ("og_image_id");
  CREATE INDEX "site_settings_sponsor_carousel_tiers_order_idx" ON "payload"."site_settings_sponsor_carousel_tiers" USING btree ("order");
  CREATE INDEX "site_settings_sponsor_carousel_tiers_parent_idx" ON "payload"."site_settings_sponsor_carousel_tiers" USING btree ("parent_id");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_documents_fk" FOREIGN KEY ("documents_id") REFERENCES "payload"."documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_gallery_photos_fk" FOREIGN KEY ("gallery_photos_id") REFERENCES "payload"."gallery_photos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sponsors_fk" FOREIGN KEY ("sponsors_id") REFERENCES "payload"."sponsors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_people_fk" FOREIGN KEY ("people_id") REFERENCES "payload"."people"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_announcements_fk" FOREIGN KEY ("announcements_id") REFERENCES "payload"."announcements"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_documents_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("documents_id");
  CREATE INDEX "payload_locked_documents_rels_gallery_photos_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("gallery_photos_id");
  CREATE INDEX "payload_locked_documents_rels_sponsors_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("sponsors_id");
  CREATE INDEX "payload_locked_documents_rels_people_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("people_id");
  CREATE INDEX "payload_locked_documents_rels_announcements_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("announcements_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."documents" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."gallery_photos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."sponsors" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."people" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."announcements" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."club_socials" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."club" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."site_settings_sponsor_carousel_tiers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."site_settings" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."documents" CASCADE;
  DROP TABLE "payload"."gallery_photos" CASCADE;
  DROP TABLE "payload"."sponsors" CASCADE;
  DROP TABLE "payload"."people" CASCADE;
  DROP TABLE "payload"."announcements" CASCADE;
  DROP TABLE "payload"."club_socials" CASCADE;
  DROP TABLE "payload"."club" CASCADE;
  DROP TABLE "payload"."site_settings_sponsor_carousel_tiers" CASCADE;
  DROP TABLE "payload"."site_settings" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_documents_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_gallery_photos_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_sponsors_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_people_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_announcements_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_documents_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_gallery_photos_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_sponsors_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_people_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_announcements_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "documents_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "gallery_photos_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "sponsors_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "people_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "announcements_id";
  DROP TYPE "payload"."enum_documents_category";
  DROP TYPE "payload"."enum_sponsors_tier";
  DROP TYPE "payload"."enum_people_section";
  DROP TYPE "payload"."enum_club_socials_platform";
  DROP TYPE "payload"."enum_site_settings_sponsor_carousel_tiers";`)
}
