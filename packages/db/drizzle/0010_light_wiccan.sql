CREATE TABLE "class_promotions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"academic_year" text NOT NULL,
	"promoted_by" text NOT NULL,
	"promotion_rules" jsonb NOT NULL,
	"graduating_class_ids" jsonb,
	"students_promoted" integer NOT NULL,
	"students_graduated" integer DEFAULT 0 NOT NULL,
	"promotion_date" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD COLUMN "promoted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "academic_year" text;--> statement-breakpoint
ALTER TABLE "classroom_files" ADD COLUMN "checksum" text;--> statement-breakpoint
ALTER TABLE "classroom_files" ADD COLUMN "original_size" integer;--> statement-breakpoint
ALTER TABLE "class_promotions" ADD CONSTRAINT "class_promotions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_promotions" ADD CONSTRAINT "class_promotions_promoted_by_users_id_fk" FOREIGN KEY ("promoted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;