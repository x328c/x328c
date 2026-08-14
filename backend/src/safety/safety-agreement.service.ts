import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FeatureFlagService } from '../common/feature-flag/feature-flag.service';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { AgreementProofDto, SafetyAgreementScene } from './dto/agreement.dto';
import { createHash } from 'crypto';
import { CreateSafetyAgreementDto } from './dto/agreement.dto';
import { OperationActorContext } from '../common/operation-log/operation-log.types';
import { OperationLogService } from '../common/operation-log/operation-log.service';

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class SafetyAgreementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagService,
    private readonly logs: OperationLogService,
  ) {}

  async active(scene: SafetyAgreementScene) {
    const agreement = await this.findActive(this.prisma, scene);
    if (!agreement) throw new AppException(56001, '当前场景暂无可用安全须知', HttpStatus.CONFLICT);
    return this.serialize(agreement);
  }

  async adminList() {
    const items = await this.prisma.safetyAgreement.findMany({
      include: { creator: true, reviewer: true },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
    return items.map((item) => ({
      id: item.id.toString(),
      code: item.code,
      version: item.version,
      title: item.title,
      scene: item.scene,
      status: item.status,
      content_hash: `sha256:${item.content_hash}`,
      effective_at: item.effective_at,
      expires_at: item.expires_at,
      created_by: item.creator.username,
      reviewed_by: item.reviewer?.username ?? null,
      reviewed_at: item.reviewed_at,
      last_legal_reviewed_at: item.last_legal_reviewed_at,
    }));
  }

  async create(dto: CreateSafetyAgreementDto, actor: OperationActorContext) {
    const effectiveAt = new Date(dto.effective_at);
    const expiresAt = dto.expires_at ? new Date(dto.expires_at) : null;
    if (expiresAt && expiresAt <= effectiveAt)
      throw new AppException(56006, '失效时间必须晚于生效时间', HttpStatus.BAD_REQUEST);
    const hash = createHash('sha256').update(dto.content).digest('hex');
    return this.prisma.$transaction(async (tx) => {
      const records = [];
      for (const scene of [...new Set(dto.scenes)]) {
        const duplicate = await tx.safetyAgreement.findUnique({
          where: {
            code_version_scene: { code: dto.code, version: dto.version, scene },
          },
          select: { id: true },
        });
        if (duplicate)
          throw new AppException(56007, `场景 ${scene} 的该版本已存在`, HttpStatus.CONFLICT);
        records.push(
          await tx.safetyAgreement.create({
            data: {
              code: dto.code,
              version: dto.version,
              title: dto.title,
              content: dto.content,
              content_hash: hash,
              scene,
              created_by: actor.adminId,
              effective_at: effectiveAt,
              expires_at: expiresAt,
              last_legal_reviewed_at: new Date(dto.last_legal_reviewed_at),
            },
          }),
        );
      }
      await this.logs.appendWithClient(tx, {
        ...actor,
        action: 'safety_agreement.create',
        objectType: 'safety_agreement_batch',
        objectId: `${dto.code}:${dto.version}`,
        reason: '创建安全须知草稿',
        afterSummary: { scenes: dto.scenes, content_hash: hash },
      });
      return records.map((record) => ({
        id: record.id.toString(),
        scene: record.scene,
        content_hash: `sha256:${hash}`,
      }));
    });
  }

  async review(id: bigint, actor: OperationActorContext, reason: string) {
    const item = await this.prisma.safetyAgreement.findUnique({ where: { id } });
    if (!item) throw new AppException(56003, '安全须知不存在', HttpStatus.NOT_FOUND);
    if (item.status === 1)
      throw new AppException(56006, '已发布安全须知不可重复复核', HttpStatus.CONFLICT);
    if (item.reviewed_at)
      throw new AppException(56006, '该安全须知已完成复核', HttpStatus.CONFLICT);
    if (item.created_by === actor.adminId)
      throw new AppException(56004, '创建人与复核人不能相同', HttpStatus.CONFLICT);
    await this.prisma.$transaction(async (tx) => {
      await tx.safetyAgreement.update({
        where: { id },
        data: { reviewed_by: actor.adminId, reviewed_at: new Date() },
      });
      await this.logs.appendWithClient(tx, {
        ...actor,
        action: 'safety_agreement.review',
        objectType: 'safety_agreement',
        objectId: id.toString(),
        reason,
      });
    });
    return { success: true };
  }

  async publish(id: bigint, actor: OperationActorContext, reason: string) {
    const item = await this.prisma.safetyAgreement.findUnique({ where: { id } });
    if (!item) throw new AppException(56003, '安全须知不存在', HttpStatus.NOT_FOUND);
    if (item.status === 1) throw new AppException(56006, '该安全须知已发布', HttpStatus.CONFLICT);
    if (!item.reviewed_by || !item.reviewed_at)
      throw new AppException(56005, '安全须知必须由另一管理员复核后发布', HttpStatus.CONFLICT);
    await this.prisma.$transaction(async (tx) => {
      await tx.safetyAgreement.updateMany({
        where: { scene: item.scene, status: 1, id: { not: id } },
        data: { status: 2, expires_at: new Date() },
      });
      await tx.safetyAgreement.update({ where: { id }, data: { status: 1 } });
      await this.logs.appendWithClient(tx, {
        ...actor,
        action: 'safety_agreement.publish',
        objectType: 'safety_agreement',
        objectId: id.toString(),
        reason,
        afterSummary: { scene: item.scene, version: item.version, content_hash: item.content_hash },
      });
    });
    return { success: true };
  }

  async verifyAndRecord(
    tx: TransactionClient,
    input: {
      userId: bigint;
      scene: SafetyAgreementScene;
      targetType: 'ride' | 'activity';
      targetId: bigint;
      proof?: AgreementProofDto;
      requestId: string;
      idempotencyKey?: string;
    },
  ) {
    const enforced = await this.flags.isEnabled('safety_agreement.enforced');
    if (!input.proof && !enforced) return null;
    if (!input.proof || !input.idempotencyKey)
      throw new AppException(56001, '请阅读并确认当前安全须知', HttpStatus.CONFLICT);

    const agreement = await this.findActive(tx, input.scene);
    if (!agreement) throw new AppException(56001, '当前场景暂无可用安全须知', HttpStatus.CONFLICT);
    const hash = input.proof.content_hash.replace(/^sha256:/, '');
    if (
      agreement.id.toString() !== input.proof.id ||
      agreement.version !== input.proof.version ||
      agreement.content_hash !== hash
    )
      throw new AppException(56002, '安全须知已更新，请重新阅读并确认', HttpStatus.CONFLICT);

    return tx.safetyAgreementAcceptance.create({
      data: {
        user_id: input.userId,
        agreement_id: agreement.id,
        scene: input.scene,
        target_type: input.targetType,
        target_id: input.targetId,
        content_hash: agreement.content_hash,
        request_id: input.requestId,
        idempotency_key: input.idempotencyKey,
      },
    });
  }

  private findActive(client: PrismaService | TransactionClient, scene: SafetyAgreementScene) {
    const now = new Date();
    return client.safetyAgreement.findFirst({
      where: {
        scene,
        status: 1,
        effective_at: { lte: now },
        OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      },
      orderBy: [{ effective_at: 'desc' }, { id: 'desc' }],
    });
  }

  private serialize(agreement: Awaited<ReturnType<SafetyAgreementService['findActive']>>) {
    if (!agreement) return null;
    return {
      id: agreement.id.toString(),
      code: agreement.code,
      version: agreement.version,
      title: agreement.title,
      content: agreement.content,
      content_hash: `sha256:${agreement.content_hash}`,
      scene: agreement.scene,
      effective_at: agreement.effective_at,
      last_legal_reviewed_at: agreement.last_legal_reviewed_at,
    };
  }
}
