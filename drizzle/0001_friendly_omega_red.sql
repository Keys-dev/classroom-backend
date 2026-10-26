ALTER TABLE "departments" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "deleted_at" timestamp;