const router = require('express').Router();
const User = require('../../models/User');
const { authMiddleware } = require('../../middleware/auth');
const requireRole = require('../../middleware/role');
const { sendWalletTopUpEmail } = require('../../services/notifyService');

router.use(authMiddleware, requireRole('client', 'admin'));

router.get('/', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('walletBalanceCents');
    if (!user) return res.status(404).json({ error: { message: 'Account not found' } });
    res.json({ data: { balanceCents: user.walletBalanceCents ?? 0 } });
  } catch (error) {
    next(error);
  }
});

router.post('/top-up', async (req, res, next) => {
  try {
    const { amountCents } = req.body;
    if (!Number.isSafeInteger(amountCents) || amountCents < 100 || amountCents > 100000) {
      return res.status(400).json({ error: { message: 'Enter an amount from $1 to $1,000.' } });
    }

    const user = await User.db.transaction(async session => {
      const account = await User.findByIdAndUpdate(req.user.id, {
        $inc: { walletBalanceCents: amountCents }
      }, { new: true, session }).select('name email walletBalanceCents');
      if (account) {
        await sendWalletTopUpEmail({
          clientName: account.name,
          clientEmail: account.email,
          amountCents,
          balanceCents: account.walletBalanceCents,
          session
        });
      }
      return account;
    });
    if (!user) return res.status(404).json({ error: { message: 'Account not found' } });

    res.json({ data: { balanceCents: user.walletBalanceCents } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
