import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ClientProxy,
  ClientProxyFactory,
  Transport,
  ClientOptions,
} from '@nestjs/microservices';
import { MessageType } from 'src/enum/messageType';

@Injectable()
export class MessagingService {
  private client: ClientProxy;
  private readonly ROUTING_KEY_BITCOIN = 'bitcoin_processing';
  private readonly logger = new Logger(MessagingService.name);

  constructor(private readonly configService: ConfigService) {
    const clientOptions: ClientOptions = {
      transport: Transport.RMQ,
      options: {
        urls: [
          this.configService.get<string>(
            'RABBITMQ_URL',
            'amqp://user:password@rabbitmq:5672',
          ),
        ],
        queue: 'bitcoin_processing',
        queueOptions: { durable: true },
        prefetchCount: 1,
        maxConnectionAttempts: 10,
        isGlobalPrefetchCount: false,
      },
    };

    this.client = ClientProxyFactory.create(clientOptions);
  }

  async onModuleInit() {
    await this.client.connect();
    this.logger.log('🚀 Connected to RabbitMQ');
  }

  async sendMessageBitcoin(data: unknown): Promise<void> {
    this.logger.log('📨 Sending message to RabbitMQ:');

    try {
      await this.client
        .send<{ type: MessageType; payload: unknown }>(
          this.ROUTING_KEY_BITCOIN,
          {
            type: MessageType.PAYLOAD_PROCESS,
            payload: data,
          },
        )
        .toPromise();
    } catch (error) {
      console.error('Error sending Bitcoin message:', error);
      throw error;
    }
  }

  async processOutput(): Promise<void> {
    this.logger.log('📨 Sending message to RabbitMQ:');

    try {
      await this.client
        .send<{ type: MessageType; payload: unknown[] }>(
          this.ROUTING_KEY_BITCOIN,
          {
            type: MessageType.SUMMARY,
            payload: [],
          },
        )
        .toPromise();
    } catch (error) {
      console.error('Error processing output:', error);
      throw error;
    }
  }

  async sendMessage(pattern: string, message: unknown): Promise<void> {
    try {
      await this.client.send(pattern, message).toPromise();
    } catch (error) {
      console.error(`Error sending message with pattern ${pattern}:`, error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.client.close();
    this.logger.log('❌ Disconnected from RabbitMQ');
  }
}
