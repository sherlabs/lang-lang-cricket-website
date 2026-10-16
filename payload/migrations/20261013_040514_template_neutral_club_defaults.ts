import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."club_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  ALTER TYPE "payload"."enum_documents_category" RENAME VALUE 'CCCA Directory' TO 'Association directory';
  ALTER TABLE "payload"."club" ALTER COLUMN "name" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "short_name" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "tagline" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "sport" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "site_url" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "locale" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "og_locale" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "email" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "sponsorship_subject" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "teams_sign_off" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "address_locality" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "address_region" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "address_region_name" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "address_country" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "address_country_name" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "map_query" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "default_title" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "title_suffix" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "default_description" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "og_image_alt" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_home_title" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_home_description" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_sponsors_title" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_sponsors_description" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_gallery_title" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_gallery_description" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_documents_title" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_documents_description" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_contact_title" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_contact_description" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_people_title" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_people_description" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_announcements_title" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_announcements_description" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_history_title" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_history_description" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_history_submit_title" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_history_submit_description" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_events_title" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_events_description" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_players_title" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_players_description" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_fixtures_title" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_fixtures_description" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_stats_title" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_stats_description" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_records_title" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_records_description" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_honours_title" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_honours_description" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_compare_title" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_compare_description" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_statlab_title" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_statlab_description" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_yearbooks_title" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_yearbooks_description" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_matches_title" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_matches_description" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "history_narrative" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "history_pull_quote" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "history_callout_eyebrow" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "history_callout_title" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "history_callout_body" DROP DEFAULT;
  ALTER TABLE "payload"."club" ALTER COLUMN "story_submit_intro" DROP DEFAULT;
  ALTER TABLE "payload"."club" ADD COLUMN "association_label" varchar;
  -- Lang Lang's visitors keep seeing "CCCA Directory": its saved club row gets the label that used to be the stored value.
  UPDATE "payload"."club" SET "association_label" = 'CCCA Directory' WHERE "name" = 'Lang Lang Cricket Club' AND "association_label" IS NULL;
  -- ...and keeps classifying CCCA honours: the keyword moved out of code into club.honourKeywords (conditional, so a blank database stays empty).
  INSERT INTO "payload"."club_texts" ("order", "parent_id", "path", "text")
  SELECT 1, c."id", 'honourKeywords', 'ccca' FROM "payload"."club" c
  WHERE c."name" = 'Lang Lang Cricket Club'
    AND NOT EXISTS (SELECT 1 FROM "payload"."club_texts" t WHERE t."parent_id" = c."id" AND t."path" = 'honourKeywords');
  ALTER TABLE "payload"."club_texts" ADD CONSTRAINT "club_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."club"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "club_texts_order_parent" ON "payload"."club_texts" USING btree ("order","parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."club_texts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."club_texts" CASCADE;
  ALTER TYPE "payload"."enum_documents_category" RENAME VALUE 'Association directory' TO 'CCCA Directory';
  ALTER TABLE "payload"."club" ALTER COLUMN "name" SET DEFAULT 'Lang Lang Cricket Club';
  ALTER TABLE "payload"."club" ALTER COLUMN "short_name" SET DEFAULT 'Lang Lang CC';
  ALTER TABLE "payload"."club" ALTER COLUMN "tagline" SET DEFAULT 'Caldermeade, Victoria';
  ALTER TABLE "payload"."club" ALTER COLUMN "sport" SET DEFAULT 'Cricket';
  ALTER TABLE "payload"."club" ALTER COLUMN "site_url" SET DEFAULT 'https://langlangcricketclub.com';
  ALTER TABLE "payload"."club" ALTER COLUMN "locale" SET DEFAULT 'en-AU';
  ALTER TABLE "payload"."club" ALTER COLUMN "og_locale" SET DEFAULT 'en_AU';
  ALTER TABLE "payload"."club" ALTER COLUMN "email" SET DEFAULT 'langlangcricketclub@gmail.com';
  ALTER TABLE "payload"."club" ALTER COLUMN "sponsorship_subject" SET DEFAULT 'Sponsorship enquiry';
  ALTER TABLE "payload"."club" ALTER COLUMN "teams_sign_off" SET DEFAULT '';
  ALTER TABLE "payload"."club" ALTER COLUMN "address_locality" SET DEFAULT 'Caldermeade';
  ALTER TABLE "payload"."club" ALTER COLUMN "address_region" SET DEFAULT 'VIC';
  ALTER TABLE "payload"."club" ALTER COLUMN "address_region_name" SET DEFAULT 'Victoria';
  ALTER TABLE "payload"."club" ALTER COLUMN "address_country" SET DEFAULT 'AU';
  ALTER TABLE "payload"."club" ALTER COLUMN "address_country_name" SET DEFAULT 'Australia';
  ALTER TABLE "payload"."club" ALTER COLUMN "map_query" SET DEFAULT 'Caldermeade, Victoria, Australia';
  ALTER TABLE "payload"."club" ALTER COLUMN "default_title" SET DEFAULT 'Lang Lang Cricket Club';
  ALTER TABLE "payload"."club" ALTER COLUMN "title_suffix" SET DEFAULT ' | Lang Lang Cricket Club';
  ALTER TABLE "payload"."club" ALTER COLUMN "default_description" SET DEFAULT 'Lang Lang Cricket Club — junior and senior cricket in Caldermeade, Victoria. A welcoming community club for beginners through to experienced players.';
  ALTER TABLE "payload"."club" ALTER COLUMN "og_image_alt" SET DEFAULT 'Lang Lang Cricket Club clubrooms and oval at Caldermeade';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_home_title" SET DEFAULT '';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_home_description" SET DEFAULT '';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_sponsors_title" SET DEFAULT 'Sponsors';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_sponsors_description" SET DEFAULT 'The local businesses and supporters who back Lang Lang Cricket Club in Caldermeade, Victoria.';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_gallery_title" SET DEFAULT 'Gallery';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_gallery_description" SET DEFAULT 'Photos from match days, presentations and club life at Lang Lang Cricket Club in Caldermeade, Victoria.';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_documents_title" SET DEFAULT 'Documents & Policies';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_documents_description" SET DEFAULT 'Codes of conduct, child safety, game day information and policies for members and families of Lang Lang Cricket Club.';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_contact_title" SET DEFAULT 'Contact';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_contact_description" SET DEFAULT 'Get in touch with Lang Lang Cricket Club in Caldermeade, Victoria, for playing, sponsorship and general enquiries.';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_people_title" SET DEFAULT 'Our People';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_people_description" SET DEFAULT 'Meet the coaches, committee and volunteers who keep Lang Lang Cricket Club in Caldermeade, Victoria running.';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_announcements_title" SET DEFAULT 'Announcements';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_announcements_description" SET DEFAULT 'Latest news and notices from Lang Lang Cricket Club in Caldermeade, Victoria.';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_history_title" SET DEFAULT 'History';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_history_description" SET DEFAULT 'Stories, memories and milestones from the long history of Lang Lang Cricket Club in Caldermeade, Victoria.';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_history_submit_title" SET DEFAULT 'Share your story';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_history_submit_description" SET DEFAULT 'Share your memories of Lang Lang Cricket Club in Caldermeade and help us preserve our history.';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_events_title" SET DEFAULT 'Events';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_events_description" SET DEFAULT 'Upcoming club events, training, and how to RSVP.';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_players_title" SET DEFAULT 'Players';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_players_description" SET DEFAULT 'Current and past players of Lang Lang Cricket Club in Caldermeade, Victoria, with career stats and club honours.';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_fixtures_title" SET DEFAULT 'Fixtures, Results & Teams';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_fixtures_description" SET DEFAULT 'Fixtures, results and teams for Lang Lang Cricket Club in Caldermeade, Victoria, across every grade and season.';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_stats_title" SET DEFAULT 'Stats & Leaderboards';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_stats_description" SET DEFAULT 'Batting, bowling and fielding leaderboards for Lang Lang Cricket Club in Caldermeade, Victoria, by season and grade.';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_records_title" SET DEFAULT 'Club Records';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_records_description" SET DEFAULT 'Club batting, bowling and fielding records for Lang Lang Cricket Club, across every season on record.';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_honours_title" SET DEFAULT 'Honour Board';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_honours_description" SET DEFAULT 'Life members, premiership players, best and fairest winners and other honours at Lang Lang Cricket Club.';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_compare_title" SET DEFAULT 'Compare Players';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_compare_description" SET DEFAULT 'Compare two Lang Lang Cricket Club players side by side: batting, bowling and fielding.';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_statlab_title" SET DEFAULT 'StatLab';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_statlab_description" SET DEFAULT 'Build your own Lang Lang Cricket Club stats table: pick columns, filters and sorting, and export to CSV.';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_yearbooks_title" SET DEFAULT 'Season Yearbooks';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_yearbooks_description" SET DEFAULT 'Season-by-season yearbooks for Lang Lang Cricket Club: messages from the club, the stats leaders, results and photos.';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_matches_title" SET DEFAULT 'Match Archive';
  ALTER TABLE "payload"."club" ALTER COLUMN "pages_matches_description" SET DEFAULT 'Every finished Lang Lang Cricket Club match this season by grade, with results and links to the full scorecards.';
  ALTER TABLE "payload"."club" ALTER COLUMN "history_narrative" SET DEFAULT 'Much of the club''s written record had faded or gone missing over the decades. In the 2022–23 season that changed: through the work of the Club Committee, the club''s history records were restored and brought back into the clubrooms.
  
  Those records now sit alongside a modern home ground in Caldermeade, developed with the support of Cardinia Shire Council and Community Bank Lang Lang, giving the next generation of juniors and seniors a place to add their own chapter.';
  ALTER TABLE "payload"."club" ALTER COLUMN "history_pull_quote" SET DEFAULT 'You cannot make history without knowing where you started.';
  ALTER TABLE "payload"."club" ALTER COLUMN "history_callout_eyebrow" SET DEFAULT 'With thanks';
  ALTER TABLE "payload"."club" ALTER COLUMN "history_callout_title" SET DEFAULT 'The Club Committee';
  ALTER TABLE "payload"."club" ALTER COLUMN "history_callout_body" SET DEFAULT 'For restoring the club''s history records in 2022–23.';
  ALTER TABLE "payload"."club" ALTER COLUMN "story_submit_intro" SET DEFAULT 'Old photos, scorebooks, match reports, memories from the clubrooms — tell us your Lang Lang story. A committee member reviews every submission before it appears on the site.';
  ALTER TABLE "payload"."club" DROP COLUMN "association_label";`)
}
