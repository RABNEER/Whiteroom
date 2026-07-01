ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "teacher_id" text;
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'classes_teacher_id_users_id_fk'
    ) THEN
        ALTER TABLE "classes" ADD CONSTRAINT "classes_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
    END IF;
END;
$$;
