ALTER TABLE "organization" ADD COLUMN "env" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "enableEnvInheritance" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "env" text DEFAULT '' NOT NULL;