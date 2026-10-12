ALTER TABLE "group_members" ADD COLUMN "upi_set_by" text;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_upi_set_by_users_id_fk" FOREIGN KEY ("upi_set_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Older rows don't record who set the UPI ID; credit whoever added the placeholder (true for IDs typed when adding them).
UPDATE "group_members" SET "upi_set_by" = "added_by" WHERE "upi_id" IS NOT NULL AND "user_id" IS NULL;
