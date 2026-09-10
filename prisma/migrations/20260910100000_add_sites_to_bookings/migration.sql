CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Site_name_key" ON "Site"("name");

ALTER TABLE "Booking" ADD COLUMN "siteId" TEXT;

DO $$
DECLARE
    migrated_site_id TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM "Booking" WHERE "siteId" IS NULL) THEN
        migrated_site_id := '00000000-0000-4000-8000-000000000001';
        INSERT INTO "Site" ("id", "name", "active", "updatedAt")
        VALUES (migrated_site_id, 'Migrated bookings', true, CURRENT_TIMESTAMP)
        ON CONFLICT ("id") DO NOTHING;
        UPDATE "Booking" SET "siteId" = migrated_site_id WHERE "siteId" IS NULL;
    END IF;
END $$;

ALTER TABLE "Booking" ALTER COLUMN "siteId" SET NOT NULL;

CREATE INDEX "Booking_siteId_dayIndex_idx" ON "Booking"("siteId", "dayIndex");

ALTER TABLE "Booking"
    ADD CONSTRAINT "Booking_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Booking"
    ADD CONSTRAINT "Booking_no_site_time_overlap"
    EXCLUDE USING gist (
        "siteId" WITH =,
        tstzrange("startsAt", "endsAt", '[)') WITH &&
    );
