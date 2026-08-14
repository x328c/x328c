import { Module } from '@nestjs/common';
import { RideController } from './ride.controller';
import { RideService } from './ride.service';
import { SafetyModule } from '../safety/safety.module';

@Module({ imports: [SafetyModule], controllers: [RideController], providers: [RideService] })
export class RideModule {}
