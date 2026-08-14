import { Module } from '@nestjs/common';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';
import { SafetyModule } from '../safety/safety.module';

@Module({
  imports: [SafetyModule],
  controllers: [ActivityController],
  providers: [ActivityService],
})
export class ActivityModule {}
