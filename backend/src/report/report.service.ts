import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { AdminReportQueryDto, CreateReportDto, HandleReportDto } from './dto';
@Injectable()
export class ReportService {
  constructor(private readonly prisma: PrismaService) {}
  async create(reporterId: bigint, dto: CreateReportDto) {
    const contentId = BigInt(dto.content_id);
    let data: Prisma.ReportCreateInput;
    if (dto.content_type === 'ride') {
      const ride = await this.prisma.ride.findFirst({ where: { id: contentId, deleted_at: null } });
      if (!ride) throw new AppException(3001, '约骑不存在', HttpStatus.NOT_FOUND);
      data = {
        reporter: { connect: { id: reporterId } },
        ride: { connect: { id: contentId } },
        content_type: 'ride',
        content_id: contentId,
        reason: dto.reason,
        description: dto.description,
      };
    } else if (dto.content_type === 'activity') {
      const activity = await this.prisma.activity.findFirst({
        where: { id: contentId, deleted_at: null },
      });
      if (!activity) throw new AppException(4001, '活动不存在', HttpStatus.NOT_FOUND);
      data = {
        reporter: { connect: { id: reporterId } },
        activity: { connect: { id: contentId } },
        content_type: 'activity',
        content_id: contentId,
        reason: dto.reason,
        description: dto.description,
      };
    } else {
      const user = await this.prisma.user.findFirst({ where: { id: contentId, deleted_at: null } });
      if (!user) throw new AppException(8001, '用户不存在', HttpStatus.NOT_FOUND);
      if (contentId === reporterId) throw new AppException(1001, '不能举报自己');
      data = {
        reporter: { connect: { id: reporterId } },
        reported_user: { connect: { id: contentId } },
        content_type: 'user',
        content_id: contentId,
        reason: dto.reason,
        description: dto.description,
      };
    }
    const report = await this.prisma.report.create({ data });
    return { id: report.id.toString(), status: report.status };
  }
  async list(query: AdminReportQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ReportWhereInput = {
      deleted_at: null,
      ...(query.status !== undefined ? { status: query.status } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.report.findMany({
        where,
        include: { reporter: true, reported_user: true },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.report.count({ where }),
    ]);
    return {
      list: items.map((x) => ({
        id: x.id.toString(),
        content_type: x.content_type,
        content_id: x.content_id?.toString() ?? null,
        reason: x.reason,
        description: x.description,
        status: x.status,
        reporter: { id: x.reporter.id.toString(), nickname: x.reporter.nickname },
        reported_user: x.reported_user
          ? { id: x.reported_user.id.toString(), nickname: x.reported_user.nickname }
          : null,
        created_at: x.created_at,
      })),
      pagination: { page, pageSize, total },
    };
  }
  async handle(adminId: bigint, id: bigint, dto: HandleReportDto) {
    const report = await this.prisma.report.findFirst({ where: { id, deleted_at: null } });
    if (!report) throw new AppException(8003, '举报不存在', HttpStatus.NOT_FOUND);
    if (report.status !== 0) throw new AppException(1001, '举报已处理');
    await this.prisma.$transaction(async (tx) => {
      if (dto.action === 'offline') {
        if (report.content_type === 'ride' && report.ride_id)
          await tx.ride.update({
            where: { id: report.ride_id },
            data: { status: 5, audit_status: 2 },
          });
        if (report.content_type === 'activity' && report.activity_id)
          await tx.activity.update({ where: { id: report.activity_id }, data: { status: 5 } });
      }
      if (dto.action === 'ban') {
        const userId =
          report.reported_user_id ??
          (report.content_type === 'ride' && report.ride_id
            ? (await tx.ride.findUniqueOrThrow({ where: { id: report.ride_id } })).user_id
            : report.content_type === 'activity' && report.activity_id
              ? (await tx.activity.findUniqueOrThrow({ where: { id: report.activity_id } })).user_id
              : null);
        if (!userId) throw new AppException(8001, '无法确定被处理用户');
        await tx.user.update({ where: { id: userId }, data: { status: 0 } });
      }
      await tx.report.update({
        where: { id },
        data: {
          status: dto.action === 'ignore' ? 2 : 1,
          handled_by: adminId,
          handled_at: new Date(),
          handling_note: dto.handling_note ?? dto.action,
        },
      });
    });
    return { success: true, status: dto.action === 'ignore' ? 2 : 1 };
  }
}
