import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { ContentSecurityModule } from './content-security/content-security.module';

@Module({
  imports: [PrismaModule, RedisModule, ContentSecurityModule],
  exports: [PrismaModule, RedisModule, ContentSecurityModule],
})
export class CommonModule {}
