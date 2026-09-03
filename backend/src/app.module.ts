import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { RetiredFeaturesController } from './common/retired-features.controller';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { RequestIdMiddleware } from './common/request/request-id.middleware';
import { FileModule } from './file/file.module';
import { MessageModule } from './message/message.module';
import { RideModule } from './ride/ride.module';
import { ReportModule } from './report/report.module';
import { RouteModule } from './route/route.module';
import { RegulationModule } from './regulation/regulation.module';
import { ScheduleModule } from './schedule/schedule.module';
import { UserModule } from './user/user.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { SafetyModule } from './safety/safety.module';
import { SettingsModule } from './settings/settings.module';
import { RegionModule } from './region/region.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    CommonModule,
    AuthModule,
    UserModule,
    RideModule,
    ReportModule,
    RouteModule,
    RegulationModule,
    MessageModule,
    FileModule,
    AdminModule,
    ScheduleModule,
    TelemetryModule,
    MaintenanceModule,
    SafetyModule,
    SettingsModule,
    RegionModule,
  ],
  controllers: [AppController, RetiredFeaturesController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, LoggerMiddleware).forRoutes('*');
  }
}
