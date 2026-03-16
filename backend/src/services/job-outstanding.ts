export const SYSTEM_DEPOSIT_PAYMENT_NOTE = "Deposit recorded on job creation";

type JobPaymentLike = {
  amountPence: number;
  note: string | null;
};

type JobOutstandingLike = {
  priceTotalPence: number;
  depositPence: number | null;
  payments: JobPaymentLike[];
};

export const getPaidPence = (payments: JobPaymentLike[]) => payments.reduce((sum, payment) => sum + payment.amountPence, 0);

export const getImplicitDepositPence = (job: JobOutstandingLike) => {
  const depositPence = job.depositPence ?? 0;
  if (depositPence <= 0) {
    return 0;
  }

  const hasDepositPayment = job.payments.some(
    (payment) => payment.note === SYSTEM_DEPOSIT_PAYMENT_NOTE && payment.amountPence === depositPence
  );

  return hasDepositPayment ? 0 : depositPence;
};

export const calculateJobOutstandingPence = (job: JobOutstandingLike) =>
  Math.max(job.priceTotalPence - getImplicitDepositPence(job) - getPaidPence(job.payments), 0);
