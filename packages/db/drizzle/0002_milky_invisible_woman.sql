CREATE TABLE "reports_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"cache_key" text NOT NULL,
	"value" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consent_logs" ADD COLUMN "mechanism" text DEFAULT 'otp' NOT NULL;--> statement-breakpoint
ALTER TABLE "reports_cache" ADD CONSTRAINT "reports_cache_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reports_cache_tenant_key_idx" ON "reports_cache" USING btree ("tenant_id","cache_key");