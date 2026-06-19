CREATE TABLE "dm_rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"participant_1_id" text NOT NULL,
	"participant_2_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"message_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"message_id" text NOT NULL,
	"user_id" text NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"room_id" text NOT NULL,
	"room_type" text NOT NULL,
	"sender_id" text NOT NULL,
	"content" text NOT NULL,
	"attachments" jsonb,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"mentions" jsonb,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_mutes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"room_id" text NOT NULL,
	"muted_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_mutes_unique_user_room" UNIQUE("user_id","room_id")
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"blocked_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_unique_block" UNIQUE("user_id","blocked_user_id")
);
--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "chat_mode" text DEFAULT 'announcement' NOT NULL;--> statement-breakpoint
ALTER TABLE "dm_rooms" ADD CONSTRAINT "dm_rooms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_rooms" ADD CONSTRAINT "dm_rooms_participant_1_id_users_id_fk" FOREIGN KEY ("participant_1_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_rooms" ADD CONSTRAINT "dm_rooms_participant_2_id_users_id_fk" FOREIGN KEY ("participant_2_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_audit_logs" ADD CONSTRAINT "message_audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_audit_logs" ADD CONSTRAINT "message_audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_receipts" ADD CONSTRAINT "message_receipts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_receipts" ADD CONSTRAINT "message_receipts_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_receipts" ADD CONSTRAINT "message_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_mutes" ADD CONSTRAINT "room_mutes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_mutes" ADD CONSTRAINT "room_mutes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_user_id_users_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dm_rooms_tenant_id_idx" ON "dm_rooms" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "dm_rooms_participants_idx" ON "dm_rooms" USING btree ("participant_1_id","participant_2_id");--> statement-breakpoint
CREATE INDEX "message_audit_logs_tenant_idx" ON "message_audit_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "message_audit_logs_created_at_idx" ON "message_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "message_receipts_tenant_message_idx" ON "message_receipts" USING btree ("tenant_id","message_id");--> statement-breakpoint
CREATE INDEX "message_receipts_user_read_idx" ON "message_receipts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_tenant_room_idx" ON "messages" USING btree ("tenant_id","room_id");--> statement-breakpoint
CREATE INDEX "messages_created_at_idx" ON "messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "room_mutes_user_room_idx" ON "room_mutes" USING btree ("user_id","room_id");--> statement-breakpoint
CREATE INDEX "user_blocks_tenant_user_idx" ON "user_blocks" USING btree ("tenant_id","user_id");