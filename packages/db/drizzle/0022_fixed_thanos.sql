CREATE TABLE IF NOT EXISTS "breach_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"incident_summary" text NOT NULL,
	"remedial_actions" text NOT NULL,
	"affected_user_count" integer DEFAULT 0 NOT NULL,
	"notified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "security_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"user_id" text,
	"event_type" text NOT NULL,
	"severity" text DEFAULT 'LOW' NOT NULL,
	"ip_address" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "whatsapp_bot_store" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "breach_notifications" ADD CONSTRAINT "breach_notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "security_audit_logs" ADD CONSTRAINT "security_audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "breach_notifications_tenant_idx" ON "breach_notifications" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "breach_notifications_notified_at_idx" ON "breach_notifications" USING btree ("notified_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "security_audit_logs_tenant_idx" ON "security_audit_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "security_audit_logs_event_type_idx" ON "security_audit_logs" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "security_audit_logs_severity_idx" ON "security_audit_logs" USING btree ("severity");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "security_audit_logs_created_at_idx" ON "security_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_sessions_tenant_date_idx" ON "attendance_sessions" USING btree ("tenant_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_sessions_class_date_idx" ON "attendance_sessions" USING btree ("class_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "classes_tenant_deleted_idx" ON "classes" USING btree ("tenant_id","deleted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "classes_teacher_idx" ON "classes" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "students_tenant_deleted_idx" ON "students" USING btree ("tenant_id","deleted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "students_parent_idx" ON "students" USING btree ("parent_id");