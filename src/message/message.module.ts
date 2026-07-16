import { Module } from '@nestjs/common';
import { MessageController } from './message.controller';
import { NotificationService } from './message.service';
import { SubscriptionMessageService } from './subscription-message.service';

@Module({
  controllers: [MessageController],
  providers: [NotificationService, SubscriptionMessageService],
  exports: [NotificationService],
})
export class MessageModule {}
