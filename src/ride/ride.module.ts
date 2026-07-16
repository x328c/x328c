import { Module } from '@nestjs/common';
import { RideController } from './ride.controller';
import { RideService } from './ride.service';

@Module({ controllers: [RideController], providers: [RideService] })
export class RideModule {}
