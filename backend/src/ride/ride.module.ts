import { Module } from '@nestjs/common';
import { RideController } from './ride.controller';
import { RideService } from './ride.service';
import { SafetyModule } from '../safety/safety.module';
import { UserModule } from '../user/user.module';
import { RegionModule } from '../region/region.module';

@Module({
  imports: [SafetyModule, UserModule, RegionModule],
  controllers: [RideController],
  providers: [RideService],
})
export class RideModule {}
