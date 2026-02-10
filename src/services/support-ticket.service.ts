import { SupportTicket, TicketPriority, TicketStatus } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import {
  createSupportTicket as createTicketInDb,
  getSupportTicketById,
  getSupportTickets,
  updateSupportTicket as updateTicketInDb,
  getTicketsByCreatorId,
  getTicketsByEmail,
  getUnassignedTickets,
  getTicketsAssignedTo,
  getTicketStatistics,
  PaginationOptions,
  PaginatedResult,
  SupportTicketFilters,
} from '../repositories/support-ticket.repository.js';

// =============================================================================
// Support Ticket Service
// =============================================================================

export interface CreateTicketInput {
  // For authenticated users
  creatorId?: string | undefined;
  // For anonymous users
  email?: string | undefined;
  name?: string | undefined;
  // Required fields
  subject: string;
  description: string;
  // Optional fields
  priority?: TicketPriority | undefined;
  relatedEntity?: string | undefined;
  relatedEntityId?: string | undefined;
}

export interface UpdateTicketInput {
  assigneeId?: string | null | undefined;
  status?: TicketStatus | undefined;
  priority?: TicketPriority | undefined;
}

/**
 * Create a new support ticket
 * Supports both authenticated and anonymous submissions
 */
export const createTicket = async (
  input: CreateTicketInput
): Promise<SupportTicket> => {
  // Validate: either creatorId OR (email AND name) must be provided
  if (!input.creatorId && (!input.email || !input.name)) {
    throw new ValidationError('Either creatorId or both email and name are required', {
      fields: ['creatorId', 'email', 'name'],
    });
  }

  // Validate subject and description
  if (!input.subject || input.subject.trim().length < 5) {
    throw new ValidationError('Subject must be at least 5 characters', {
      field: 'subject',
    });
  }

  if (!input.description || input.description.trim().length < 10) {
    throw new ValidationError('Description must be at least 10 characters', {
      field: 'description',
    });
  }

  logger.info(
    {
      creatorId: input.creatorId,
      email: input.email,
      subject: input.subject,
    },
    'Creating support ticket'
  );

  const ticket = await createTicketInDb({
    creatorId: input.creatorId,
    email: input.email?.toLowerCase().trim(),
    name: input.name?.trim(),
    subject: input.subject.trim(),
    description: input.description.trim(),
    priority: input.priority,
    relatedEntity: input.relatedEntity,
    relatedEntityId: input.relatedEntityId,
  });

  logger.info({ ticketId: ticket.id }, 'Support ticket created successfully');

  return ticket;
};

/**
 * Get a single ticket by ID
 */
export const getTicket = async (id: string): Promise<SupportTicket> => {
  const ticket = await getSupportTicketById(id);

  if (!ticket) {
    throw new NotFoundError(`Support ticket ${id} not found`);
  }

  return ticket;
};

/**
 * List tickets with optional filtering
 */
export const listTickets = async (
  filters: SupportTicketFilters = {},
  pagination: PaginationOptions = { page: 1, limit: 20 }
): Promise<PaginatedResult<SupportTicket>> => {
  return getSupportTickets(filters, pagination);
};

/**
 * Update a ticket (typically by support staff)
 */
export const updateTicket = async (
  id: string,
  input: UpdateTicketInput,
  updatedBy?: string
): Promise<SupportTicket> => {
  // Verify ticket exists
  const existingTicket = await getSupportTicketById(id);
  if (!existingTicket) {
    throw new NotFoundError(`Support ticket ${id} not found`);
  }

  const updateData: Parameters<typeof updateTicketInDb>[1] = {};

  if (input.assigneeId !== undefined) {
    updateData.assigneeId = input.assigneeId;
  }

  if (input.status) {
    updateData.status = input.status;

    // Set resolved/closed timestamps
    if (input.status === TicketStatus.RESOLVED && !existingTicket.resolvedAt) {
      updateData.resolvedAt = new Date();
    }
    if (input.status === TicketStatus.CLOSED && !existingTicket.closedAt) {
      updateData.closedAt = new Date();
    }
  }

  if (input.priority) {
    updateData.priority = input.priority;
  }

  logger.info(
    {
      ticketId: id,
      updates: updateData,
      updatedBy,
    },
    'Updating support ticket'
  );

  const ticket = await updateTicketInDb(id, updateData);

  if (!ticket) {
    throw new NotFoundError(`Support ticket ${id} not found`);
  }

  return ticket;
};

/**
 * Assign a ticket to a support agent
 */
export const assignTicket = async (
  ticketId: string,
  assigneeId: string,
  assignedBy?: string
): Promise<SupportTicket> => {
  logger.info({ ticketId, assigneeId, assignedBy }, 'Assigning ticket');

  return updateTicket(
    ticketId,
    {
      assigneeId,
      status: TicketStatus.IN_PROGRESS,
    },
    assignedBy
  );
};

/**
 * Resolve a ticket
 */
export const resolveTicket = async (
  ticketId: string,
  resolvedBy?: string
): Promise<SupportTicket> => {
  logger.info({ ticketId, resolvedBy }, 'Resolving ticket');

  return updateTicket(
    ticketId,
    { status: TicketStatus.RESOLVED },
    resolvedBy
  );
};

/**
 * Close a ticket
 */
export const closeTicket = async (
  ticketId: string,
  closedBy?: string
): Promise<SupportTicket> => {
  logger.info({ ticketId, closedBy }, 'Closing ticket');

  return updateTicket(
    ticketId,
    { status: TicketStatus.CLOSED },
    closedBy
  );
};

/**
 * Get tickets for a specific user (authenticated)
 */
export const getUserTickets = async (
  userId: string,
  pagination: PaginationOptions = { page: 1, limit: 20 }
): Promise<PaginatedResult<SupportTicket>> => {
  return getTicketsByCreatorId(userId, pagination);
};

/**
 * Get tickets by email (for anonymous users to track their submissions)
 */
export const getAnonymousUserTickets = async (
  email: string,
  pagination: PaginationOptions = { page: 1, limit: 20 }
): Promise<PaginatedResult<SupportTicket>> => {
  return getTicketsByEmail(email.toLowerCase().trim(), pagination);
};

/**
 * Get unassigned tickets for the support queue
 */
export const getSupportQueue = async (
  pagination: PaginationOptions = { page: 1, limit: 20 }
): Promise<PaginatedResult<SupportTicket>> => {
  return getUnassignedTickets(pagination);
};

/**
 * Get tickets assigned to a specific agent
 */
export const getAgentTickets = async (
  agentId: string,
  pagination: PaginationOptions = { page: 1, limit: 20 }
): Promise<PaginatedResult<SupportTicket>> => {
  return getTicketsAssignedTo(agentId, pagination);
};

/**
 * Get ticket statistics for dashboard
 */
export const getStatistics = async () => {
  return getTicketStatistics();
};
