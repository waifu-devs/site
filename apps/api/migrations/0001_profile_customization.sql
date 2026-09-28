ALTER TABLE "users" ADD COLUMN "profile_theme_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "banner" text DEFAULT 'blobs' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "skills" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "links" text[] DEFAULT '{}' NOT NULL;