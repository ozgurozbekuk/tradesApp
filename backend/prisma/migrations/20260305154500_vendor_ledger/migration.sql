-- Create enums
CREATE TYPE "MoneyDirection" AS ENUM ('inflow', 'outflow');
CREATE TYPE "MoneyTransactionKind" AS ENUM ('expense_paid', 'vendor_debt_added', 'vendor_payment_made');

-- Create tables
CREATE TABLE "VendorLedger" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "vendorName" TEXT NOT NULL,
  "vendorNameNormalized" TEXT NOT NULL,
  "balancePence" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VendorLedger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MoneyTransaction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "MoneyTransactionKind" NOT NULL,
  "direction" "MoneyDirection" NOT NULL,
  "amountPence" INTEGER NOT NULL,
  "vendorId" TEXT,
  "counterpartyName" TEXT,
  "note" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MoneyTransaction_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "VendorLedger_userId_idx" ON "VendorLedger"("userId");
CREATE UNIQUE INDEX "VendorLedger_userId_vendorNameNormalized_key" ON "VendorLedger"("userId", "vendorNameNormalized");
CREATE INDEX "MoneyTransaction_userId_occurredAt_idx" ON "MoneyTransaction"("userId", "occurredAt");
CREATE INDEX "MoneyTransaction_vendorId_idx" ON "MoneyTransaction"("vendorId");

-- FKs
ALTER TABLE "VendorLedger"
ADD CONSTRAINT "VendorLedger_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MoneyTransaction"
ADD CONSTRAINT "MoneyTransaction_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MoneyTransaction"
ADD CONSTRAINT "MoneyTransaction_vendorId_fkey"
FOREIGN KEY ("vendorId") REFERENCES "VendorLedger"("id") ON DELETE SET NULL ON UPDATE CASCADE;
