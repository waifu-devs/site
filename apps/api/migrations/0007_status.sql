CREATE TABLE "status_components" (
	"component" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"latency_ms" integer,
	"checked_at" timestamp with time zone NOT NULL,
	"since" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_days" (
	"component" text NOT NULL,
	"day" date NOT NULL,
	"checks" integer DEFAULT 0 NOT NULL,
	"up" integer DEFAULT 0 NOT NULL,
	"slow" integer DEFAULT 0 NOT NULL,
	"latency_ms_sum" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "status_days_component_day_pk" PRIMARY KEY("component","day")
);
--> statement-breakpoint
CREATE TABLE "status_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"component" text NOT NULL,
	"reason" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "status_incidents_started_at" ON "status_incidents" USING btree ("started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "status_incidents_open" ON "status_incidents" USING btree ("component") WHERE "status_incidents"."ended_at" IS NULL;