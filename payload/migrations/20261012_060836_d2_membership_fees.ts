import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_membership_tiers_kind" AS ENUM('upfront', 'per-match', 'free');
  CREATE TYPE "payload"."enum_fee_seasons_status" AS ENUM('open', 'closed');
  CREATE TYPE "payload"."enum_fee_charges_kind" AS ENUM('season', 'game', 'adjustment');
  CREATE TYPE "payload"."enum_fee_payments_method" AS ENUM('cash', 'bank-transfer', 'other');
  CREATE TYPE "payload"."enum_fee_payments_applies_to_kind" AS ENUM('season', 'charge');
  CREATE TYPE "payload"."enum_fee_waivers_scope" AS ENUM('game', 'season', 'amount');
  CREATE TABLE "payload"."membership_tiers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"season" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"kind" "payload"."enum_membership_tiers_kind" DEFAULT 'upfront' NOT NULL,
  	"upfront_cents" numeric DEFAULT 0,
  	"per_match_cents" numeric DEFAULT 0,
  	"active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."memberships" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"member_id" integer NOT NULL,
  	"season" varchar NOT NULL,
  	"tier_id" integer NOT NULL,
  	"joined_on" timestamp(3) with time zone,
  	"note" varchar,
  	"upfront_cents_snapshot" numeric,
  	"per_match_cents_snapshot" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."fee_seasons" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"season" varchar NOT NULL,
  	"status" "payload"."enum_fee_seasons_status" DEFAULT 'open' NOT NULL,
  	"closed_at" timestamp(3) with time zone,
  	"closed_by_id" integer,
  	"charges_total_cents" numeric,
  	"snapshot_count" numeric,
  	"closed_anyway" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."fee_charges" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"member_id" integer NOT NULL,
  	"season" varchar NOT NULL,
  	"kind" "payload"."enum_fee_charges_kind" NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL,
  	"match_id" varchar,
  	"amount_cents" numeric NOT NULL,
  	"description" varchar,
  	"closed_at" timestamp(3) with time zone,
  	"voided_at" timestamp(3) with time zone,
  	"voided_by_id" integer,
  	"void_reason" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."fee_payments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"member_id" integer NOT NULL,
  	"payer_id" integer,
  	"split_group" varchar,
  	"received_on" timestamp(3) with time zone NOT NULL,
  	"amount_cents" numeric NOT NULL,
  	"method" "payload"."enum_fee_payments_method" NOT NULL,
  	"reference" varchar,
  	"note" varchar,
  	"applies_to_kind" "payload"."enum_fee_payments_applies_to_kind",
  	"applies_to_season" varchar,
  	"applies_to_charge_id" varchar,
  	"applies_to_match_id" varchar,
  	"recorded_by_id" integer,
  	"voided_at" timestamp(3) with time zone,
  	"voided_by_id" integer,
  	"void_reason" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."fee_waivers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"member_id" integer NOT NULL,
  	"scope" "payload"."enum_fee_waivers_scope" NOT NULL,
  	"match_id" varchar,
  	"season" varchar,
  	"amount_cents" numeric,
  	"note" varchar NOT NULL,
  	"granted_by_id" integer,
  	"voided_at" timestamp(3) with time zone,
  	"voided_by_id" integer,
  	"void_reason" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "membership_tiers_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "memberships_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "fee_seasons_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "fee_charges_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "fee_payments_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "fee_waivers_id" integer;
  ALTER TABLE "payload"."office_settings" ADD COLUMN "charge_fill_ins" boolean DEFAULT false;
  ALTER TABLE "payload"."memberships" ADD CONSTRAINT "memberships_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "payload"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."memberships" ADD CONSTRAINT "memberships_tier_id_membership_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "payload"."membership_tiers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."fee_seasons" ADD CONSTRAINT "fee_seasons_closed_by_id_users_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."fee_charges" ADD CONSTRAINT "fee_charges_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "payload"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."fee_charges" ADD CONSTRAINT "fee_charges_voided_by_id_users_id_fk" FOREIGN KEY ("voided_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."fee_payments" ADD CONSTRAINT "fee_payments_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "payload"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."fee_payments" ADD CONSTRAINT "fee_payments_payer_id_members_id_fk" FOREIGN KEY ("payer_id") REFERENCES "payload"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."fee_payments" ADD CONSTRAINT "fee_payments_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."fee_payments" ADD CONSTRAINT "fee_payments_voided_by_id_users_id_fk" FOREIGN KEY ("voided_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."fee_waivers" ADD CONSTRAINT "fee_waivers_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "payload"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."fee_waivers" ADD CONSTRAINT "fee_waivers_granted_by_id_users_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."fee_waivers" ADD CONSTRAINT "fee_waivers_voided_by_id_users_id_fk" FOREIGN KEY ("voided_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "membership_tiers_season_idx" ON "payload"."membership_tiers" USING btree ("season");
  CREATE INDEX "membership_tiers_updated_at_idx" ON "payload"."membership_tiers" USING btree ("updated_at");
  CREATE INDEX "membership_tiers_created_at_idx" ON "payload"."membership_tiers" USING btree ("created_at");
  CREATE INDEX "memberships_member_idx" ON "payload"."memberships" USING btree ("member_id");
  CREATE INDEX "memberships_season_idx" ON "payload"."memberships" USING btree ("season");
  CREATE INDEX "memberships_tier_idx" ON "payload"."memberships" USING btree ("tier_id");
  CREATE INDEX "memberships_updated_at_idx" ON "payload"."memberships" USING btree ("updated_at");
  CREATE INDEX "memberships_created_at_idx" ON "payload"."memberships" USING btree ("created_at");
  CREATE UNIQUE INDEX "member_season_idx" ON "payload"."memberships" USING btree ("member_id","season");
  CREATE UNIQUE INDEX "fee_seasons_season_idx" ON "payload"."fee_seasons" USING btree ("season");
  CREATE INDEX "fee_seasons_closed_by_idx" ON "payload"."fee_seasons" USING btree ("closed_by_id");
  CREATE INDEX "fee_seasons_updated_at_idx" ON "payload"."fee_seasons" USING btree ("updated_at");
  CREATE INDEX "fee_seasons_created_at_idx" ON "payload"."fee_seasons" USING btree ("created_at");
  CREATE INDEX "fee_charges_member_idx" ON "payload"."fee_charges" USING btree ("member_id");
  CREATE INDEX "fee_charges_season_idx" ON "payload"."fee_charges" USING btree ("season");
  CREATE INDEX "fee_charges_voided_by_idx" ON "payload"."fee_charges" USING btree ("voided_by_id");
  CREATE INDEX "fee_charges_updated_at_idx" ON "payload"."fee_charges" USING btree ("updated_at");
  CREATE INDEX "fee_charges_created_at_idx" ON "payload"."fee_charges" USING btree ("created_at");
  CREATE INDEX "member_season_1_idx" ON "payload"."fee_charges" USING btree ("member_id","season");
  CREATE INDEX "fee_payments_member_idx" ON "payload"."fee_payments" USING btree ("member_id");
  CREATE INDEX "fee_payments_payer_idx" ON "payload"."fee_payments" USING btree ("payer_id");
  CREATE INDEX "fee_payments_split_group_idx" ON "payload"."fee_payments" USING btree ("split_group");
  CREATE INDEX "fee_payments_recorded_by_idx" ON "payload"."fee_payments" USING btree ("recorded_by_id");
  CREATE INDEX "fee_payments_voided_by_idx" ON "payload"."fee_payments" USING btree ("voided_by_id");
  CREATE INDEX "fee_payments_updated_at_idx" ON "payload"."fee_payments" USING btree ("updated_at");
  CREATE INDEX "fee_payments_created_at_idx" ON "payload"."fee_payments" USING btree ("created_at");
  CREATE INDEX "member_receivedOn_idx" ON "payload"."fee_payments" USING btree ("member_id","received_on");
  CREATE INDEX "fee_waivers_member_idx" ON "payload"."fee_waivers" USING btree ("member_id");
  CREATE INDEX "fee_waivers_season_idx" ON "payload"."fee_waivers" USING btree ("season");
  CREATE INDEX "fee_waivers_granted_by_idx" ON "payload"."fee_waivers" USING btree ("granted_by_id");
  CREATE INDEX "fee_waivers_voided_by_idx" ON "payload"."fee_waivers" USING btree ("voided_by_id");
  CREATE INDEX "fee_waivers_updated_at_idx" ON "payload"."fee_waivers" USING btree ("updated_at");
  CREATE INDEX "fee_waivers_created_at_idx" ON "payload"."fee_waivers" USING btree ("created_at");
  CREATE INDEX "member_idx" ON "payload"."fee_waivers" USING btree ("member_id");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_membership_tiers_fk" FOREIGN KEY ("membership_tiers_id") REFERENCES "payload"."membership_tiers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_memberships_fk" FOREIGN KEY ("memberships_id") REFERENCES "payload"."memberships"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_fee_seasons_fk" FOREIGN KEY ("fee_seasons_id") REFERENCES "payload"."fee_seasons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_fee_charges_fk" FOREIGN KEY ("fee_charges_id") REFERENCES "payload"."fee_charges"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_fee_payments_fk" FOREIGN KEY ("fee_payments_id") REFERENCES "payload"."fee_payments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_fee_waivers_fk" FOREIGN KEY ("fee_waivers_id") REFERENCES "payload"."fee_waivers"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_membership_tiers_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("membership_tiers_id");
  CREATE INDEX "payload_locked_documents_rels_memberships_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("memberships_id");
  CREATE INDEX "payload_locked_documents_rels_fee_seasons_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("fee_seasons_id");
  CREATE INDEX "payload_locked_documents_rels_fee_charges_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("fee_charges_id");
  CREATE INDEX "payload_locked_documents_rels_fee_payments_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("fee_payments_id");
  CREATE INDEX "payload_locked_documents_rels_fee_waivers_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("fee_waivers_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."membership_tiers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."memberships" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."fee_seasons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."fee_charges" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."fee_payments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."fee_waivers" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."membership_tiers" CASCADE;
  DROP TABLE "payload"."memberships" CASCADE;
  DROP TABLE "payload"."fee_seasons" CASCADE;
  DROP TABLE "payload"."fee_charges" CASCADE;
  DROP TABLE "payload"."fee_payments" CASCADE;
  DROP TABLE "payload"."fee_waivers" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_membership_tiers_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_memberships_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_fee_seasons_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_fee_charges_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_fee_payments_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_fee_waivers_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_membership_tiers_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_memberships_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_fee_seasons_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_fee_charges_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_fee_payments_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_fee_waivers_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "membership_tiers_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "memberships_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "fee_seasons_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "fee_charges_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "fee_payments_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "fee_waivers_id";
  ALTER TABLE "payload"."office_settings" DROP COLUMN "charge_fill_ins";
  DROP TYPE "payload"."enum_membership_tiers_kind";
  DROP TYPE "payload"."enum_fee_seasons_status";
  DROP TYPE "payload"."enum_fee_charges_kind";
  DROP TYPE "payload"."enum_fee_payments_method";
  DROP TYPE "payload"."enum_fee_payments_applies_to_kind";
  DROP TYPE "payload"."enum_fee_waivers_scope";`)
}
