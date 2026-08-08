import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OperationLogService } from './operation-log.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [OperationLogService],
  exports: [OperationLogService],
})
export class OperationLogModule {}
