CREATE TABLE "theme_votes" (
	"theme_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "theme_votes_theme_id_user_id_pk" PRIMARY KEY("theme_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "themes" ADD COLUMN "score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "themes" ADD COLUMN "mode" text;--> statement-breakpoint
ALTER TABLE "themes" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "theme_votes" ADD CONSTRAINT "theme_votes_theme_id_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_votes" ADD CONSTRAINT "theme_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "theme_votes_user_id" ON "theme_votes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "themes_public_score" ON "themes" USING btree ("score" DESC NULLS LAST,"created_at" DESC NULLS LAST) WHERE "themes"."is_public";--> statement-breakpoint
CREATE INDEX "users_theme_id" ON "users" USING btree ("theme_id");