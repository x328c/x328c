import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationQueryDto } from './dto';
import {
  SubscriptionData,
  SubscriptionMessageService,
  SubscriptionTemplate,
} from './subscription-message.service';

export interface CreateNotificationInput {
  user_id: bigint;
  type: number;
  title: string;
  content: string;
  related_type?: string;
  related_id?: bigint;
  from_user_id?: bigint;
}

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscription: SubscriptionMessageService,
  ) {}
  async create(
    input: CreateNotificationInput,
    push?: { template: SubscriptionTemplate; data: SubscriptionData; page?: string },
  ) {
    const notification = await this.prisma.notification.create({ data: input });
    if (push)
      void this.subscription.push(
        notification.id,
        input.user_id,
        push.template,
        push.data,
        push.page,
      );
    return notification;
  }
  async list(userId: bigint, query: NotificationQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const type =
      query.category === 'ride_activity'
        ? { in: [1, 2, 3, 4, 5] }
        : query.category === 'system'
          ? 6
          : undefined;
    const where: Prisma.NotificationWhereInput = {
      user_id: userId,
      deleted_at: null,
      ...(type ? { type } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return {
      list: items.map((item) => ({
        id: item.id.toString(),
        type: item.type,
        title: item.title,
        content: item.content,
        related_type: item.related_type,
        related_id: item.related_id?.toString() ?? null,
        is_read: item.is_read,
        unread_dot: !item.is_read,
        created_at: item.created_at,
      })),
      pagination: { page, pageSize, total },
    };
  }
  async unreadCount(userId: bigint) {
    return {
      count: await this.prisma.notification.count({
        where: { user_id: userId, is_read: false, deleted_at: null },
      }),
    };
  }
  async read(userId: bigint, id: bigint) {
    const changed = await this.prisma.notification.updateMany({
      where: { id, user_id: userId, deleted_at: null },
      data: { is_read: true },
    });
    if (!changed.count) throw new AppException(6001, '通知不存在', HttpStatus.NOT_FOUND);
    return { success: true };
  }
  async readAll(userId: bigint) {
    const result = await this.prisma.notification.updateMany({
      where: { user_id: userId, is_read: false, deleted_at: null },
      data: { is_read: true },
    });
    return { count: result.count };
  }
}
