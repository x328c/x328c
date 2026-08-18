import { Module } from '@nestjs/common';
import { RideController } from './ride.controller';
import { RideService } from './ride.service';
import { SafetyModule } from '../safety/safety.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [SafetyModule, UserModule],
  controllers: [RideController],
  providers: [RideService],
})
export class RideModule {}
