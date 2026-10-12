CREATE TABLE "friendships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" text NOT NULL,
	"addressee_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "friendships_distinct" CHECK ("friendships"."requester_id" <> "friendships"."addressee_id")
);
--> statement-breakpoint
CREATE TABLE "group_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"actor_user_id" text,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_expense_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" uuid NOT NULL,
	"name" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"member_ids" uuid[] NOT NULL,
	"sort" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_expense_payers" (
	"expense_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"paid_paise" bigint NOT NULL,
	CONSTRAINT "group_expense_payers_expense_id_member_id_pk" PRIMARY KEY("expense_id","member_id"),
	CONSTRAINT "group_expense_payers_nonneg" CHECK ("group_expense_payers"."paid_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "group_expense_shares" (
	"expense_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"share_paise" bigint NOT NULL,
	"input_value" bigint,
	CONSTRAINT "group_expense_shares_expense_id_member_id_pk" PRIMARY KEY("expense_id","member_id"),
	CONSTRAINT "group_expense_shares_nonneg" CHECK ("group_expense_shares"."share_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "group_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"category_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"split_mode" text NOT NULL,
	"tax_paise" bigint DEFAULT 0 NOT NULL,
	"tip_paise" bigint DEFAULT 0 NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_expenses_amount_positive" CHECK ("group_expenses"."amount_paise" > 0),
	CONSTRAINT "group_expenses_adjustments" CHECK ("group_expenses"."tax_paise" >= 0 and "group_expenses"."tip_paise" >= 0 and "group_expenses"."discount_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "group_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "group_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" text,
	"display_name" text NOT NULL,
	"upi_id" text,
	"role" text DEFAULT 'member' NOT NULL,
	"added_by" text,
	"claimed_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" text NOT NULL,
	"name" text NOT NULL,
	"emoji" text DEFAULT '👥' NOT NULL,
	"color" text DEFAULT '#C8F560' NOT NULL,
	"kind" text DEFAULT 'group' NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_dates_order" CHECK ("groups"."starts_on" is null or "groups"."ends_on" is null or "groups"."ends_on" >= "groups"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"href" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"acted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"from_member" uuid NOT NULL,
	"to_member" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"marked_by" text,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlements_amount_positive" CHECK ("settlements"."amount_paise" > 0),
	CONSTRAINT "settlements_distinct_members" CHECK ("settlements"."from_member" <> "settlements"."to_member")
);
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_amount_positive";--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_share_range";--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "system" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "group_expense_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "settlement_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "count_receivables" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "coach_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "quiet_hours" jsonb;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_addressee_id_users_id_fk" FOREIGN KEY ("addressee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_activity" ADD CONSTRAINT "group_activity_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_activity" ADD CONSTRAINT "group_activity_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_expense_items" ADD CONSTRAINT "group_expense_items_expense_id_group_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."group_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_expense_payers" ADD CONSTRAINT "group_expense_payers_expense_id_group_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."group_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_expense_payers" ADD CONSTRAINT "group_expense_payers_member_id_group_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_expense_shares" ADD CONSTRAINT "group_expense_shares_expense_id_group_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."group_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_expense_shares" ADD CONSTRAINT "group_expense_shares_member_id_group_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_expenses" ADD CONSTRAINT "group_expenses_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_expenses" ADD CONSTRAINT "group_expenses_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_expenses" ADD CONSTRAINT "group_expenses_created_by_group_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_expenses" ADD CONSTRAINT "group_expenses_updated_by_group_members_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_from_member_group_members_id_fk" FOREIGN KEY ("from_member") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_to_member_group_members_id_fk" FOREIGN KEY ("to_member") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_marked_by_users_id_fk" FOREIGN KEY ("marked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "friendships_pair" ON "friendships" USING btree (least("requester_id", "addressee_id"),greatest("requester_id", "addressee_id"));--> statement-breakpoint
CREATE INDEX "friendships_addressee" ON "friendships" USING btree ("addressee_id");--> statement-breakpoint
CREATE INDEX "group_activity_group_time" ON "group_activity" USING btree ("group_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "group_expense_items_expense" ON "group_expense_items" USING btree ("expense_id");--> statement-breakpoint
CREATE INDEX "group_expense_payers_member" ON "group_expense_payers" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "group_expense_shares_member" ON "group_expense_shares" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "group_expenses_group_time" ON "group_expenses" USING btree ("group_id","occurred_at" DESC NULLS LAST) WHERE "group_expenses"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "group_invites_one_active" ON "group_invites" USING btree ("group_id") WHERE "group_invites"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "group_members_user_unique" ON "group_members" USING btree ("group_id","user_id") WHERE "group_members"."user_id" is not null and "group_members"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "group_members_user" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_seq" ON "notifications" USING btree ("user_id","seq" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe" ON "notifications" USING btree ("user_id","dedupe_key") WHERE "notifications"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "settlements_group" ON "settlements" USING btree ("group_id","marked_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_group_expense_id_group_expenses_id_fk" FOREIGN KEY ("group_expense_id") REFERENCES "public"."group_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_any_user" ON "audit_log" USING btree ("entity","entity_id","seq" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_group_mirror_unique" ON "transactions" USING btree ("user_id","group_expense_id") WHERE "transactions"."group_expense_id" is not null and "transactions"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_settlement_mirror_unique" ON "transactions" USING btree ("user_id","settlement_id") WHERE "transactions"."settlement_id" is not null and "transactions"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_mirror_source" CHECK (("transactions"."group_expense_id" is null or "transactions"."source" = 'group') and ("transactions"."settlement_id" is null or "transactions"."source" = 'settlement'));--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_positive" CHECK ("transactions"."amount" > 0 or ("transactions"."source" = 'group' and "transactions"."amount" = 0));--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_share_range" CHECK ("transactions"."personal_share" >= 0 and ("transactions"."source" = 'group' or "transactions"."personal_share" <= "transactions"."amount"));