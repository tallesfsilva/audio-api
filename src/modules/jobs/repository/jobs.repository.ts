// src/modules/jobs/repository/jobs.repository.ts
import { Prisma } from '@prisma/client';
import {Job, JobStatus, TranscriptionLanguage,} from '../../../shared/types/domain'
import { prisma } from '../../../infrastructure/database/client';

export interface JobsPage {
  items: Job[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ListJobsFilter {
  userId: string;
  status?: JobStatus;
  page?: number;
  pageSize?: number;
}

class JobsRepository {
  async create(data: Prisma.JobCreateInput): Promise<Job> {
    return prisma.job.create({ data });
  }

  async findById(id: string): Promise<Job | null> {
    return prisma.job.findUnique({ where: { id } });
  }

  async findJobAndUser(id: string): Promise<Job | null> {
    return prisma.job.findUnique({ where: { id }, include: { user: true} });
  }


  async findByIdAndUserId(id: string, userId: string): Promise<Job | null> {
    return prisma.job.findFirst({ where: { id, userId } });
  }

  async list(filter: ListJobsFilter): Promise<JobsPage> {
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, filter.pageSize ?? 20));
    const skip = (page - 1) * pageSize;
   let where:Prisma.JobWhereInput = {}
    if(filter.userId) {
      where = {
      userId: filter.userId,
      ...(filter.status ? { status: filter.status } : {}),
    };

    }
  
    const [items, total] = await prisma.$transaction([
      prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.job.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async markAsQueued(id: string, bullJobId: string): Promise<Job> {
    return prisma.job.update({
      where: { id },
      data: {
        status: JobStatus.QUEUED,
        bullJobId,
        queuedAt: new Date(),
      },
    });
  }

  async markAsProcessing(id: string): Promise<Job> {
    return prisma.job.update({
      where: { id },
      data: {
        status: JobStatus.PROCESSING,
        startedAt: new Date(),
        progress: 5,
      },
    });
  }

  async updateProgress(id: string, progress: number): Promise<Job> {
    return prisma.job.update({
      where: { id },
      data: { progress: Math.min(99, Math.max(0, progress)) },
    });
  }

  async markAsCompleted(
    id: string,
    result: {
      durationSeconds?: number;
      wordCount?: number;
      charCount?: number;
      resultKey?: string;
      resultText?: string;
      language: TranscriptionLanguage;
      resultTextKey?: string;
      transcription?: string;
    },
  ): Promise<Job> {
    return prisma.job.update({
      where: { id },
      data: {
        status: JobStatus.COMPLETED,
        completedAt: new Date(),
        progress: 100,
        ...result,
      },
    });
  }

  async markAsFailed(id: string, errorMessage: string): Promise<Job> {
    return prisma.job.update({
      where: { id },
      data: {
        status: JobStatus.FAILED,
        failedAt: new Date(),
        errorMessage,
        retryCount: { increment: 1 },
      },
    });
  }

  async markAsCancelled(id: string): Promise<Job> {
    return prisma.job.update({
      where: { id },
      data: { status: JobStatus.CANCELLED },
    });
  }

  async incrementUserMinutes(userId: string, minutes: number): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { usedMinutes: { increment: minutes } },
    });
  }

  async getUserUsage(userId: string): Promise<{ usedMinutes: number; monthlyQuota: number }> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { usedMinutes: true, monthlyQuota: true },
    });
    return user;
  }

  async delete(id: string): Promise<void> {
    await prisma.job.delete({ where: { id } });
  }
}

export const jobRepository = new JobsRepository();
