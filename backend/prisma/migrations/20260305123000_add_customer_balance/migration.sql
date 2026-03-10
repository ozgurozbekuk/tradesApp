ALTER TABLE "Customer"
ADD COLUMN "balancePence" INTEGER NOT NULL DEFAULT 0;

UPDATE "Customer" c
SET "balancePence" = COALESCE(
  (
    SELECT SUM(
      GREATEST(
        j."priceTotalPence" - COALESCE(j."depositPence", 0) - COALESCE(
          (
            SELECT SUM(p."amountPence")
            FROM "Payment" p
            WHERE p."jobId" = j."id"
          ),
          0
        ),
        0
      )
    )::INTEGER
    FROM "Job" j
    WHERE j."customerId" = c."id"
      AND j."status" = 'active'
  ),
  0
);
