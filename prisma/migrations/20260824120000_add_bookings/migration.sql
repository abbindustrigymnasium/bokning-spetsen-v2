CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayIndex" DATE NOT NULL,
    "startsAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
    "endsAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Booking_dayIndex_idx" ON "Booking"("dayIndex");
CREATE INDEX "Booking_userId_dayIndex_idx" ON "Booking"("userId", "dayIndex");

ALTER TABLE "Booking"
    ADD CONSTRAINT "Booking_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Booking"
    ADD CONSTRAINT "Booking_valid_time_range"
    CHECK ("startsAt" < "endsAt");

ALTER TABLE "Booking"
    ADD CONSTRAINT "Booking_same_stockholm_day"
    CHECK (
        ("startsAt" AT TIME ZONE 'Europe/Stockholm')::date =
        ("endsAt" AT TIME ZONE 'Europe/Stockholm')::date
    );

ALTER TABLE "Booking"
    ADD CONSTRAINT "Booking_day_index_matches_start"
    CHECK (
        "dayIndex" = ("startsAt" AT TIME ZONE 'Europe/Stockholm')::date
    );
