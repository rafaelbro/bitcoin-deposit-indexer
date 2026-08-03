import { Module } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [MessagingService, ConfigService],
  controllers: [],
})
export class MessagingModule {}
