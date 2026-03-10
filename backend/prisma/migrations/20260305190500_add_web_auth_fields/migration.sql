ALTER TABLE "User"
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "whatsappActivatedAt" TIMESTAMP(3);
