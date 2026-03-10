ALTER TABLE "User"
ADD COLUMN "email" TEXT;

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "PhoneVerificationChallenge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clerkUserId" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PhoneVerificationChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PhoneVerificationChallenge_clerkUserId_key" ON "PhoneVerificationChallenge"("clerkUserId");
CREATE INDEX "PhoneVerificationChallenge_userId_idx" ON "PhoneVerificationChallenge"("userId");
CREATE INDEX "PhoneVerificationChallenge_phone_idx" ON "PhoneVerificationChallenge"("phone");

ALTER TABLE "PhoneVerificationChallenge"
ADD CONSTRAINT "PhoneVerificationChallenge_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
