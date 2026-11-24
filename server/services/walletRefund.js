const HOUR_MS = 60 * 60 * 1000;

function calculateWalletRefund(paidCents, slotStart, cancelledAt, cancelledBy) {
  const remainingMs = slotStart.getTime() - cancelledAt.getTime();
  let percent = 0;

  if (remainingMs > 0) {
    if (cancelledBy === 'provider' || remainingMs >= 3 * HOUR_MS) percent = 100;
    else if (remainingMs >= 2 * HOUR_MS) percent = 75;
    else if (remainingMs >= HOUR_MS) percent = 50;
    else percent = 25;
  }

  const amountCents = Math.floor(paidCents * percent / 100);
  return { percent, amountCents, status: amountCents > 0 ? 'credited' : 'not_due' };
}

module.exports = calculateWalletRefund;
