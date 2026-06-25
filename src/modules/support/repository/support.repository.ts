/**
 * Support ticket repository
 * --------------------------
 * Encapsulates all Prisma access for SupportTicket.
 * The service layer (support.module.ts) should depend on this,
 * never on `prisma` directly, so the ORM stays swappable and testable.
 */
import { prisma } from '../../../infrastructure/database/client';
import { SupportTicket } from "@prisma/client";

export interface CreateSupportTicketInput {
  subject: string;
  category: string;
  message: string;
  userId?: string | null;
  userEmail?: string | null;
}

export interface SupportTicketRepository {
  create(input: CreateSupportTicketInput): Promise<SupportTicket>;
  findById(id: string): Promise<SupportTicket | null>;
  updateStatus(id: string, status: string): Promise<SupportTicket>;
  listByUser(userId: string): Promise<SupportTicket[]>;
  listTickets(): Promise<SupportTicket[]> ;
}

class PrismaSupportTicketRepository implements SupportTicketRepository {
  async create(input: CreateSupportTicketInput): Promise<SupportTicket> {
    return prisma.supportTicket.create({
      data: {
        subject: input.subject,
        category: input.category,
        message: input.message,
        userId: input.userId ?? null,
        userEmail: input.userEmail ?? null,
      },
    });
  }

  async findById(id: string): Promise<SupportTicket | null> {
    return prisma.supportTicket.findUnique({ where: { id } });
  }

  async updateStatus(id: string, status: string): Promise<SupportTicket> {
    return prisma.supportTicket.update({
      where: { id },
      data: { status },
    });
  }
 async listTickets(): Promise<SupportTicket[]> {
    return prisma.supportTicket.findMany({
      orderBy: { createdAt: "desc" },
    });
  }
  async listByUser(userId: string): Promise<SupportTicket[]> {
    return prisma.supportTicket.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }
}

// Singleton export — swap this implementation in tests via dependency injection
// (e.g. pass a mock repository into createSupportTicket instead of importing this directly).
export const supportTicketRepository: SupportTicketRepository = new PrismaSupportTicketRepository();
