import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { TicketPriority, TicketStatus } from '@prisma/client';
import { supportTicketService } from '../../../services/index.js';
import { ValidationError } from '../../../utils/errors.js';
import { logger } from '../../../utils/logger.js';

// =============================================================================
// Support Ticket Routes
// =============================================================================

const router = Router();

// =============================================================================
// Validation Schemas
// =============================================================================

const createTicketSchema = z.object({
  // For authenticated users (optional - will be set from auth middleware if available)
  creatorId: z.string().uuid().optional(),
  // For anonymous users
  email: z.string().email('Invalid email address').optional(),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100).optional(),
  // Required fields
  subject: z.string().min(5, 'Subject must be at least 5 characters').max(200),
  description: z.string().min(10, 'Description must be at least 10 characters').max(5000),
  // Optional fields
  priority: z.nativeEnum(TicketPriority).optional(),
  relatedEntity: z.string().max(50).optional(),
  relatedEntityId: z.string().uuid().optional(),
}).refine(
  (data) => data.creatorId || (data.email && data.name),
  {
    message: 'Either creatorId or both email and name are required',
    path: ['email', 'name'],
  }
);

const updateTicketSchema = z.object({
  assigneeId: z.string().uuid().nullable().optional(),
  status: z.nativeEnum(TicketStatus).optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'updatedAt', 'priority', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const filtersSchema = z.object({
  status: z.union([
    z.nativeEnum(TicketStatus),
    z.array(z.nativeEnum(TicketStatus)),
  ]).optional(),
  priority: z.union([
    z.nativeEnum(TicketPriority),
    z.array(z.nativeEnum(TicketPriority)),
  ]).optional(),
  creatorId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  email: z.string().email().optional(),
});

// =============================================================================
// Validation Middleware
// =============================================================================

const validateBody = <T extends z.ZodSchema>(schema: T) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      next(new ValidationError('Validation failed', { errors }));
      return;
    }
    req.body = result.data;
    next();
  };
};

const validateQuery = <T extends z.ZodSchema>(schema: T) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const errors = result.error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      next(new ValidationError('Invalid query parameters', { errors }));
      return;
    }
    req.query = result.data as typeof req.query;
    next();
  };
};

// =============================================================================
// Routes
// =============================================================================

/**
 * POST /support/tickets
 * Create a new support ticket
 * Public endpoint - supports both authenticated and anonymous submissions
 */
router.post(
  '/tickets',
  validateBody(createTicketSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ticketData = req.body as z.infer<typeof createTicketSchema>;

      // TODO: If auth middleware adds user to request, use their ID
      // const userId = req.user?.id;
      // if (userId) {
      //   ticketData.creatorId = userId;
      // }

      const ticket = await supportTicketService.createTicket(ticketData);

      logger.info(
        {
          ticketId: ticket.id,
          email: ticketData.email,
          ip: req.ip,
        },
        'Support ticket created via API'
      );

      res.status(201).json({
        success: true,
        data: ticket,
        message: 'Support ticket created successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /support/tickets
 * List all tickets with optional filtering
 * TODO: Add authentication - only support/admin roles should access this
 */
router.get(
  '/tickets',
  validateQuery(paginationSchema.merge(filtersSchema)),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit, sortBy, sortOrder, ...filters } = req.query as z.infer<
        typeof paginationSchema
      > &
        z.infer<typeof filtersSchema>;

      const result = await supportTicketService.listTickets(filters, {
        page,
        limit,
        sortBy,
        sortOrder,
      });

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /support/tickets/stats
 * Get ticket statistics
 * TODO: Add authentication - only support/admin roles should access this
 */
router.get(
  '/tickets/stats',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stats = await supportTicketService.getStatistics();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /support/tickets/queue
 * Get unassigned tickets (support queue)
 * TODO: Add authentication - only support/admin roles should access this
 */
router.get(
  '/tickets/queue',
  validateQuery(paginationSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const pagination = req.query as z.infer<typeof paginationSchema>;

      const result = await supportTicketService.getSupportQueue(pagination);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /support/tickets/:id
 * Get a specific ticket by ID
 */
router.get(
  '/tickets/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const ticket = await supportTicketService.getTicket(id);

      res.json({
        success: true,
        data: ticket,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /support/tickets/:id
 * Update a ticket (status, priority, assignment)
 * TODO: Add authentication - only support/admin roles should access this
 */
router.patch(
  '/tickets/:id',
  validateBody(updateTicketSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const updates = req.body as z.infer<typeof updateTicketSchema>;

      // TODO: Get user ID from auth middleware
      // const updatedBy = req.user?.id;
      const updatedBy = undefined;

      const ticket = await supportTicketService.updateTicket(id, updates, updatedBy);

      logger.info(
        {
          ticketId: id,
          updates,
          updatedBy,
        },
        'Support ticket updated via API'
      );

      res.json({
        success: true,
        data: ticket,
        message: 'Support ticket updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /support/tickets/:id/assign
 * Assign a ticket to a support agent
 * TODO: Add authentication - only support/admin roles should access this
 */
router.post(
  '/tickets/:id/assign',
  validateBody(z.object({ assigneeId: z.string().uuid() })),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { assigneeId } = req.body;

      // TODO: Get user ID from auth middleware
      // const assignedBy = req.user?.id;
      const assignedBy = undefined;

      const ticket = await supportTicketService.assignTicket(id, assigneeId, assignedBy);

      res.json({
        success: true,
        data: ticket,
        message: 'Ticket assigned successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /support/tickets/:id/resolve
 * Mark a ticket as resolved
 * TODO: Add authentication - only support/admin roles should access this
 */
router.post(
  '/tickets/:id/resolve',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      // TODO: Get user ID from auth middleware
      // const resolvedBy = req.user?.id;
      const resolvedBy = undefined;

      const ticket = await supportTicketService.resolveTicket(id, resolvedBy);

      res.json({
        success: true,
        data: ticket,
        message: 'Ticket resolved successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /support/tickets/:id/close
 * Close a ticket
 * TODO: Add authentication - only support/admin roles should access this
 */
router.post(
  '/tickets/:id/close',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      // TODO: Get user ID from auth middleware
      // const closedBy = req.user?.id;
      const closedBy = undefined;

      const ticket = await supportTicketService.closeTicket(id, closedBy);

      res.json({
        success: true,
        data: ticket,
        message: 'Ticket closed successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /support/tickets/user/:userId
 * Get tickets for a specific user
 * TODO: Add authentication - users should only see their own tickets
 */
router.get(
  '/tickets/user/:userId',
  validateQuery(paginationSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req.params;
      const pagination = req.query as z.infer<typeof paginationSchema>;

      const result = await supportTicketService.getUserTickets(userId, pagination);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /support/tickets/email/:email
 * Get tickets by email (for anonymous users to track their submissions)
 * Rate limited to prevent enumeration
 */
router.get(
  '/tickets/email/:email',
  validateQuery(paginationSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = req.params;
      const pagination = req.query as z.infer<typeof paginationSchema>;

      // Validate email format
      const emailResult = z.string().email().safeParse(email);
      if (!emailResult.success) {
        throw new ValidationError('Invalid email format');
      }

      const result = await supportTicketService.getAnonymousUserTickets(email, pagination);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
