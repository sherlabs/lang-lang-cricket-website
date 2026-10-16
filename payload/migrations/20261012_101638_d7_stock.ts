import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_stock_items_category" AS ENUM('kit', 'equipment', 'consumables', 'other');
  CREATE TYPE "payload"."enum_stock_movements_kind" AS ENUM('received', 'issued', 'returned', 'lost', 'written-off', 'adjustment');
  CREATE TABLE "payload"."stock_items" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"group_name" varchar,
  	"size" varchar,
  	"category" "payload"."enum_stock_items_category" DEFAULT 'kit' NOT NULL,
  	"unit" varchar DEFAULT 'each',
  	"reorder_level" numeric,
  	"location" varchar,
  	"returnable" boolean,
  	"active" boolean DEFAULT true,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."stock_issues" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"item_id" integer NOT NULL,
  	"member_id" integer NOT NULL,
  	"qty" numeric NOT NULL,
  	"issued_on" timestamp(3) with time zone NOT NULL,
  	"due_back_on" timestamp(3) with time zone,
  	"returnable" boolean DEFAULT true,
  	"note" varchar,
  	"recorded_by_id" integer,
  	"voided_at" timestamp(3) with time zone,
  	"voided_by_id" integer,
  	"void_reason" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."stock_movements" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"item_id" integer NOT NULL,
  	"kind" "payload"."enum_stock_movements_kind" NOT NULL,
  	"qty" numeric NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL,
  	"member_id" integer,
  	"issue_id" integer,
  	"note" varchar,
  	"idempotency_key" varchar,
  	"recorded_by_id" integer,
  	"voided_at" timestamp(3) with time zone,
  	"voided_by_id" integer,
  	"void_reason" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "stock_items_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "stock_issues_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "stock_movements_id" integer;
  ALTER TABLE "payload"."stock_issues" ADD CONSTRAINT "stock_issues_item_id_stock_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "payload"."stock_items"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."stock_issues" ADD CONSTRAINT "stock_issues_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "payload"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."stock_issues" ADD CONSTRAINT "stock_issues_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."stock_issues" ADD CONSTRAINT "stock_issues_voided_by_id_users_id_fk" FOREIGN KEY ("voided_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."stock_movements" ADD CONSTRAINT "stock_movements_item_id_stock_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "payload"."stock_items"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."stock_movements" ADD CONSTRAINT "stock_movements_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "payload"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."stock_movements" ADD CONSTRAINT "stock_movements_issue_id_stock_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "payload"."stock_issues"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."stock_movements" ADD CONSTRAINT "stock_movements_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."stock_movements" ADD CONSTRAINT "stock_movements_voided_by_id_users_id_fk" FOREIGN KEY ("voided_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "stock_items_active_idx" ON "payload"."stock_items" USING btree ("active");
  CREATE INDEX "stock_items_updated_at_idx" ON "payload"."stock_items" USING btree ("updated_at");
  CREATE INDEX "stock_items_created_at_idx" ON "payload"."stock_items" USING btree ("created_at");
  CREATE INDEX "stock_issues_item_idx" ON "payload"."stock_issues" USING btree ("item_id");
  CREATE INDEX "stock_issues_member_idx" ON "payload"."stock_issues" USING btree ("member_id");
  CREATE INDEX "stock_issues_recorded_by_idx" ON "payload"."stock_issues" USING btree ("recorded_by_id");
  CREATE INDEX "stock_issues_voided_by_idx" ON "payload"."stock_issues" USING btree ("voided_by_id");
  CREATE INDEX "stock_issues_updated_at_idx" ON "payload"."stock_issues" USING btree ("updated_at");
  CREATE INDEX "stock_issues_created_at_idx" ON "payload"."stock_issues" USING btree ("created_at");
  CREATE INDEX "stock_movements_item_idx" ON "payload"."stock_movements" USING btree ("item_id");
  CREATE INDEX "stock_movements_kind_idx" ON "payload"."stock_movements" USING btree ("kind");
  CREATE INDEX "stock_movements_member_idx" ON "payload"."stock_movements" USING btree ("member_id");
  CREATE INDEX "stock_movements_issue_idx" ON "payload"."stock_movements" USING btree ("issue_id");
  CREATE UNIQUE INDEX "stock_movements_idempotency_key_idx" ON "payload"."stock_movements" USING btree ("idempotency_key");
  CREATE INDEX "stock_movements_recorded_by_idx" ON "payload"."stock_movements" USING btree ("recorded_by_id");
  CREATE INDEX "stock_movements_voided_by_idx" ON "payload"."stock_movements" USING btree ("voided_by_id");
  CREATE INDEX "stock_movements_updated_at_idx" ON "payload"."stock_movements" USING btree ("updated_at");
  CREATE INDEX "stock_movements_created_at_idx" ON "payload"."stock_movements" USING btree ("created_at");
  CREATE INDEX "item_date_idx" ON "payload"."stock_movements" USING btree ("item_id","date");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_stock_items_fk" FOREIGN KEY ("stock_items_id") REFERENCES "payload"."stock_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_stock_issues_fk" FOREIGN KEY ("stock_issues_id") REFERENCES "payload"."stock_issues"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_stock_movements_fk" FOREIGN KEY ("stock_movements_id") REFERENCES "payload"."stock_movements"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_stock_items_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("stock_items_id");
  CREATE INDEX "payload_locked_documents_rels_stock_issues_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("stock_issues_id");
  CREATE INDEX "payload_locked_documents_rels_stock_movements_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("stock_movements_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."stock_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."stock_issues" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."stock_movements" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."stock_items" CASCADE;
  DROP TABLE "payload"."stock_issues" CASCADE;
  DROP TABLE "payload"."stock_movements" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_stock_items_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_stock_issues_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_stock_movements_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_stock_items_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_stock_issues_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_stock_movements_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "stock_items_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "stock_issues_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "stock_movements_id";
  DROP TYPE "payload"."enum_stock_items_category";
  DROP TYPE "payload"."enum_stock_movements_kind";`)
}
