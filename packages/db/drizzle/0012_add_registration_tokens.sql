CREATE TABLE IF NOT EXISTS "registration_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"firebase_uid" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registration_tokens_phone_idx" ON "registration_tokens" USING btree ("phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registration_tokens_id_idx" ON "registration_tokens" USING btree ("id");
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'registration_tokens_expires_at_check'
    ) THEN
        ALTER TABLE "registration_tokens" ADD CONSTRAINT "registration_tokens_expires_at_check" CHECK ("expires_at" > now());
    END IF;
END;
$$;
