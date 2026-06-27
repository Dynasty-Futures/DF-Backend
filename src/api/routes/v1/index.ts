import { Router } from 'express';
import supportRoutes from './support.js';
import affiliateRoutes from './affiliates.js';
import authRoutes from './auth.js';
import usersRoutes from './users.js';
import accountsRoutes from './accounts.js';
import tradingRoutes from './trading.js';
import payoutsRoutes from './payouts.js';
import journalRoutes from './journal.js';
import webhooksRoutes from './webhooks.js';

// =============================================================================
// V1 API Routes
// =============================================================================

const router = Router();

// TODO: Import and mount route modules as they are implemented
// import challengesRoutes from './challenges.js';
// import adminRoutes from './admin.js';

// Mounted routes
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/support', supportRoutes);
router.use('/affiliates', affiliateRoutes);
router.use('/accounts', accountsRoutes);
router.use('/trading', tradingRoutes);
router.use('/payouts', payoutsRoutes);
router.use('/journal', journalRoutes);
router.use('/webhooks', webhooksRoutes);

// router.use('/challenges', challengesRoutes);
// router.use('/admin', adminRoutes);

// Placeholder route
router.get('/', (_req, res) => {
  res.json({
    version: 'v1',
    message: 'Dynasty Futures API',
    documentation: '/v1/docs',
    endpoints: {
      auth: '/v1/auth',
      users: '/v1/users',
      accounts: '/v1/accounts',
      trading: '/v1/trading',
      payouts: '/v1/payouts',
      journal: '/v1/journal',
      support: '/v1/support/tickets',
      affiliates: '/v1/affiliates/apply',
      webhooks: '/v1/webhooks/ypf',
    },
  });
});

export default router;
