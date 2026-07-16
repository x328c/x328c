import { Module } from '@nestjs/common';
import { ScheduleModule as NestScheduleModule } from '@nestjs/schedule';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';
import { RideStatusScheduler } from './ride-status.scheduler';

@Module({
  imports: [NestScheduleModule.forRoot()],
  controllers: [ScheduleController],
  providers: [ScheduleService, RideStatusScheduler],
})
export class ScheduleModule {}
