import { Prisma, SupportTicket, TicketPriority, TicketStatus } from '@prisma/client';
import { prisma } from '../utils/database.js';

// =============================================================================
// Support Ticket Repository
// =============================================================================

export interface CreateSupportTicketData {
  creatorId?: string | undefined;
  email?: string | undefined;
  name?: string | undefined;
  subject: string;
  description: string;
  priority?: TicketPriority | undefined;
  relatedEntity?: string | undefined;
  relatedEntityId?: string | undefined;
}

export interface UpdateSupportTicketData {
  assigneeId?: string | null | undefined;
  status?: TicketStatus | undefined;
  priority?: TicketPriority | undefined;
  resolvedAt?: Date | null | undefined;
  closedAt?: Date | null | undefined;
}

export interface SupportTicketFilters {
  status?: TicketStatus | TicketStatus[] | undefined;
  priority?: TicketPriority | TicketPriority[] | undefined;
  creatorId?: string | undefined;
  assigneeId?: string | null | undefined;
  email?: string | undefined;
}

export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'priority' | 'status' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/**
 * Create a new support ticket
 */
export const createSupportTicket = async (
  data: CreateSupportTicketData
): Promise<SupportTicket> => {
  return prisma.supportTicket.create({
    data: {
      subject: data.subject,
      description: data.description,
      priority: data.priority ?? TicketPriority.MEDIUM,
      // Only include optional fields if they have values
      ...(data.creatorId && { creatorId: data.creatorId }),
      ...(data.email && { email: data.email }),
      ...(data.name && { name: data.name }),
      ...(data.relatedEntity && { relatedEntity: data.relatedEntity }),
      ...(data.relatedEntityId && { relatedEntityId: data.relatedEntityId }),
    },
    include: {
      creator: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
      assignee: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });
};

/**
 * Get a support ticket by ID
 */
export const getSupportTicketById = async (
  id: string
): Promise<SupportTicket | null> => {
  return prisma.supportTicket.findUnique({
    where: { id },
    include: {
      creator: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
      assignee: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });
};

/**
 * Get all support tickets with filtering and pagination
 */
export const getSupportTickets = async (
  filters: SupportTicketFilters = {},
  pagination: PaginationOptions = { page: 1, limit: 20 }
): Promise<PaginatedResult<SupportTicket>> => {
  const { page, limit, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: Prisma.SupportTicketWhereInput = {};

  if (filters.status) {
    where.status = Array.isArray(filters.status)
      ? { in: filters.status }
      : filters.status;
  }

  if (filters.priority) {
    where.priority = Array.isArray(filters.priority)
      ? { in: filters.priority }
      : filters.priority;
  }

  if (filters.creatorId) {
    where.creatorId = filters.creatorId;
  }

  if (filters.assigneeId !== undefined) {
    where.assigneeId = filters.assigneeId;
  }

  if (filters.email) {
    where.email = filters.email;
  }

  // Execute queries in parallel
  const [tickets, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      include: {
        creator: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        assignee: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    }),
    prisma.supportTicket.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data: tickets,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  };
};

/**
 * Update a support ticket
 */
export const updateSupportTicket = async (
  id: string,
  data: UpdateSupportTicketData
): Promise<SupportTicket | null> => {
  try {
    return await prisma.supportTicket.update({
      where: { id },
      data: {
        ...(data.assigneeId !== undefined && { assigneeId: data.assigneeId }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.resolvedAt !== undefined && { resolvedAt: data.resolvedAt }),
        ...(data.closedAt !== undefined && { closedAt: data.closedAt }),
      },
      include: {
        creator: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        assignee: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      return null;
    }
    throw error;
  }
};

/**
 * Get tickets by creator ID (for authenticated users)
 */
export const getTicketsByCreatorId = async (
  creatorId: string,
  pagination: PaginationOptions = { page: 1, limit: 20 }
): Promise<PaginatedResult<SupportTicket>> => {
  return getSupportTickets({ creatorId }, pagination);
};

/**
 * Get tickets by email (for anonymous users to track their tickets)
 */
export const getTicketsByEmail = async (
  email: string,
  pagination: PaginationOptions = { page: 1, limit: 20 }
): Promise<PaginatedResult<SupportTicket>> => {
  return getSupportTickets({ email }, pagination);
};

/**
 * Get unassigned tickets (for support team)
 */
export const getUnassignedTickets = async (
  pagination: PaginationOptions = { page: 1, limit: 20 }
): Promise<PaginatedResult<SupportTicket>> => {
  return getSupportTickets({ assigneeId: null }, pagination);
};

/**
 * Get tickets assigned to a specific support agent
 */
export const getTicketsAssignedTo = async (
  assigneeId: string,
  pagination: PaginationOptions = { page: 1, limit: 20 }
): Promise<PaginatedResult<SupportTicket>> => {
  return getSupportTickets({ assigneeId }, pagination);
};

/**
 * Get open tickets count (for dashboard stats)
 */
export const getOpenTicketsCount = async (): Promise<number> => {
  return prisma.supportTicket.count({
    where: {
      status: {
        in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS, TicketStatus.WAITING_RESPONSE],
      },
    },
  });
};

/**
 * Get ticket statistics
 */
export const getTicketStatistics = async (): Promise<{
  total: number;
  byStatus: Record<TicketStatus, number>;
  byPriority: Record<TicketPriority, number>;
}> => {
  const [total, statusCounts, priorityCounts] = await Promise.all([
    prisma.supportTicket.count(),
    prisma.supportTicket.groupBy({
      by: ['status'],
      _count: { status: true },
    }),
    prisma.supportTicket.groupBy({
      by: ['priority'],
      _count: { priority: true },
    }),
  ]);

  const byStatus = {} as Record<TicketStatus, number>;
  for (const status of Object.values(TicketStatus)) {
    byStatus[status] = 0;
  }
  for (const item of statusCounts) {
    byStatus[item.status] = item._count.status;
  }

  const byPriority = {} as Record<TicketPriority, number>;
  for (const priority of Object.values(TicketPriority)) {
    byPriority[priority] = 0;
  }
  for (const item of priorityCounts) {
    byPriority[item.priority] = item._count.priority;
  }

  return { total, byStatus, byPriority };
};
