CREATE TABLE "featured_repos" (
	"user_id" uuid NOT NULL,
	"repo_id" bigint NOT NULL,
	"position" integer NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"language" text,
	"stars" integer DEFAULT 0 NOT NULL,
	"forks" integer DEFAULT 0 NOT NULL,
	"fork" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"topics" text[] DEFAULT '{}' NOT NULL,
	"pushed_at" timestamp with time zone,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "featured_repos_user_id_repo_id_pk" PRIMARY KEY("user_id","repo_id")
);
--> statement-breakpoint
ALTER TABLE "featured_repos" ADD CONSTRAINT "featured_repos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;