CREATE TABLE "otp_lockouts" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "otp_lockouts_phone_idx" ON "otp_lockouts" USING btree ("phone");
