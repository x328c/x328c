import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ActivityModule } from './activity/activity.module';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { FileModule } from './file/file.module';
import { MessageModule } from './message/message.module';
import { RideModule } from './ride/ride.module';
import { ReportModule } from './report/report.module';
import { ScheduleModule } from './schedule/schedule.module';
import { UserModule } from './user/user.module';

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
    ActivityModule,
    MessageModule,
    FileModule,
    AdminModule,
    ScheduleModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
