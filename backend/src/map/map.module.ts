import { Module } from '@nestjs/common';
import { MapProviderService } from './map-provider.service';

@Module({ providers: [MapProviderService], exports: [MapProviderService] })
export class MapModule {}
