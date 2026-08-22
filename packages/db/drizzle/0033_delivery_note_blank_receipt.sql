ALTER TABLE "delivery_notes" ALTER COLUMN "received_by" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "delivery_notes" ALTER COLUMN "signature_image" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "delivery_notes" ALTER COLUMN "signed_on" DROP NOT NULL;
