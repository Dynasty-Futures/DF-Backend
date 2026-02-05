import { Router } from 'express';
import supportRoutes from './support.js';

// =============================================================================
// V1 API Routes
// =============================================================================

const router = Router();

// TODO: Import and mount route modules as they are implemented
// import authRoutes from './auth.js';
// import usersRoutes from './users.js';
// import accountsRoutes from './accounts.js';
// import challengesRoutes from './challenges.js';
// import payoutsRoutes from './payouts.js';
// import adminRoutes from './admin.js';

// Mounted routes
router.use('/support', supportRoutes);

// router.use('/auth', authRoutes);
// router.use('/users', usersRoutes);
// router.use('/accounts', accountsRoutes);
// router.use('/challenges', challengesRoutes);
// router.use('/payouts', payoutsRoutes);
// router.use('/admin', adminRoutes);

// Placeholder route
router.get('/', (_req, res) => {
  res.json({
    version: 'v1',
    message: 'Dynasty Futures API',
    documentation: '/v1/docs',
    endpoints: {
      support: '/v1/support/tickets',
    },
  });
});

export default router;
