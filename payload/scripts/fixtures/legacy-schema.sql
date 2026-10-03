-- Legacy (pre-Payload) schema, generated with `drizzle-kit export` from db/schema.ts at main
-- (commit e1f5017). Unqualified names: the fixture seeder sets search_path to the target schema.

CREATE TABLE "announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "committee_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"photo_url" text DEFAULT '' NOT NULL,
	"section" text DEFAULT 'committee' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "event_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"url" text NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'approved' NOT NULL,
	"submitter_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "event_rsvps" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"occurrence_date" timestamp NOT NULL,
	"name" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"response" text DEFAULT 'yes' NOT NULL,
	"meal" text DEFAULT '' NOT NULL,
	"edit_token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "event_rsvps_edit_token_unique" UNIQUE("edit_token")
);

CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"cover_image_url" text DEFAULT '' NOT NULL,
	"payment_link_label" text DEFAULT '' NOT NULL,
	"payment_link_url" text DEFAULT '' NOT NULL,
	"meal_options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"event_time" text DEFAULT '' NOT NULL,
	"event_date" timestamp,
	"day_of_week" integer,
	"start_date" timestamp,
	"end_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "gallery_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "player_aliases" (
	"name_key" text PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL
);

CREATE TABLE "player_honours" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"years" text NOT NULL,
	"title" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);

CREATE TABLE "player_seasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"season_name" text NOT NULL,
	"season_order" integer NOT NULL,
	"team_id" text NOT NULL,
	"team_name" text NOT NULL,
	"grade_name" text,
	"games" integer DEFAULT 0 NOT NULL,
	"bat_innings" integer DEFAULT 0 NOT NULL,
	"bat_not_outs" integer DEFAULT 0 NOT NULL,
	"bat_runs" integer DEFAULT 0 NOT NULL,
	"bat_high_score" integer DEFAULT 0 NOT NULL,
	"bat_high_score_not_out" boolean DEFAULT false NOT NULL,
	"bat_balls" integer DEFAULT 0 NOT NULL,
	"bat_fours" integer DEFAULT 0 NOT NULL,
	"bat_sixes" integer DEFAULT 0 NOT NULL,
	"bowl_balls" integer DEFAULT 0 NOT NULL,
	"bowl_maidens" integer DEFAULT 0 NOT NULL,
	"bowl_runs" integer DEFAULT 0 NOT NULL,
	"bowl_wickets" integer DEFAULT 0 NOT NULL,
	"bowl_best_wickets" integer DEFAULT 0 NOT NULL,
	"bowl_best_runs" integer DEFAULT 0 NOT NULL,
	"catches" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "player_seasons_player_team" UNIQUE("player_id","team_id")
);

CREATE TABLE "player_sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"status" text NOT NULL,
	"players_created" integer DEFAULT 0 NOT NULL,
	"season_rows" integer DEFAULT 0 NOT NULL,
	"error" text
);

CREATE TABLE "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"photo_url" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"manual_years" text DEFAULT '' NOT NULL,
	"active_override" text,
	"is_active_derived" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "players_slug_unique" UNIQUE("slug")
);

CREATE TABLE "site_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "sponsors" (
	"id" serial PRIMARY KEY NOT NULL,
	"tier" text NOT NULL,
	"name" text NOT NULL,
	"logo_url" text NOT NULL,
	"link_url" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "stories" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"content_json" jsonb NOT NULL,
	"content_html" text NOT NULL,
	"cover_image_url" text DEFAULT '' NOT NULL,
	"author_name" text NOT NULL,
	"author_email" text DEFAULT '' NOT NULL,
	"submitted_by_admin" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"edit_token" text NOT NULL,
	"view_token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"published_at" timestamp,
	"reviewed_at" timestamp,
	CONSTRAINT "stories_slug_unique" UNIQUE("slug"),
	CONSTRAINT "stories_edit_token_unique" UNIQUE("edit_token"),
	CONSTRAINT "stories_view_token_unique" UNIQUE("view_token")
);

ALTER TABLE "player_aliases" ADD CONSTRAINT "player_aliases_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "player_honours" ADD CONSTRAINT "player_honours_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "player_seasons" ADD CONSTRAINT "player_seasons_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
