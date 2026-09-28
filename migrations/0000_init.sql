CREATE TABLE "openauth_storage" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"variant" jsonb NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_id" bigint NOT NULL,
	"username" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"bio" text,
	"pronouns" text,
	"website" text,
	"favorite_waifu" text,
	"theme_id" text DEFAULT 'sakura' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_github_id_unique" UNIQUE("github_id")
);
--> statement-breakpoint
ALTER TABLE "themes" ADD CONSTRAINT "themes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "openauth_storage_expires_at" ON "openauth_storage" USING btree ("expires_at") WHERE "openauth_storage"."expires_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "themes_owner_id" ON "themes" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "themes_public_created" ON "themes" USING btree ("created_at" DESC NULLS LAST) WHERE "themes"."is_public";--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower" ON "users" USING btree (lower("username"));