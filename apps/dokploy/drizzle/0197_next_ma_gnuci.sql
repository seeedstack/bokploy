ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "env" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment" ADD COLUMN IF NOT EXISTS "isProduction" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "enableEnvInheritance" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN IF NOT EXISTS "env" text DEFAULT '' NOT NULL;