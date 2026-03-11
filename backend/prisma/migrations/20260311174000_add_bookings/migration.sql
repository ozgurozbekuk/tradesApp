CREATE TYPE "BookingStatus" AS ENUM ('scheduled', 'completed', 'canceled');

CREATE TABLE "Booking" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "title" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "status" "BookingStatus" NOT NULL DEFAULT 'scheduled',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Booking_userId_startsAt_idx" ON "Booking"("userId", "startsAt");
CREATE INDEX "Booking_customerId_startsAt_idx" ON "Booking"("customerId", "startsAt");
CREATE INDEX "Booking_userId_status_startsAt_idx" ON "Booking"("userId", "status", "startsAt");

ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
