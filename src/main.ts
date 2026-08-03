import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { MessagingService } from './messaging/messaging.service';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { createClient } from 'redis';

async function bootstrap() {
  const appContext = await NestFactory.createApplicationContext(AppModule);
  const configService = appContext.get(ConfigService);

  const rabbitMQUrl = configService.get<string>(
    'RABBITMQ_URL',
    'amqp://user:password@rabbitmq:5672',
  );
  const rabbitMQQueue = configService.get<string>(
    'RABBITMQ_QUEUE',
    'bitcoin_processing',
  );
  const redisHost = configService.get<string>('REDIS_HOST', 'redis');
  const redisPort = configService.get<number>('REDIS_PORT', 6379);
  const redisUrl = `redis://${redisHost}:${redisPort}`;

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [rabbitMQUrl],
        queue: rabbitMQQueue,
        queueOptions: {
          durable: true,
        },
        noAck: false,
      },
    },
  );

  const messagingService = app.get(MessagingService);

  const redisClient = createClient({ url: redisUrl });
  redisClient.on('error', (err) => console.error('Redis Client Error', err));

  await redisClient.connect();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`Received ${signal}, shutting down gracefully...`);
    try {
      await redisClient.quit();
    } catch (error) {
      console.error('Error closing Redis client', error);
    }
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen();
  console.log('NestJS app with RabbitMQ and Redis is running...');

  try {
    const rawData1 = fs.readFileSync(
      './fixtures/sample-snapshot-1.json',
      'utf8',
    );
    const rawData2 = fs.readFileSync(
      './fixtures/sample-snapshot-2.json',
      'utf8',
    );

    await Promise.all([
      messagingService
        .sendMessageBitcoin(rawData1)
        .catch((error) => console.error('Error sending block payload', error)),
      messagingService
        .sendMessageBitcoin(rawData2)
        .catch((error) => console.error('Error sending block payload', error)),
    ]);
  } catch (error) {
    console.error(
      'Error processing the transaction file:',
      (error as Error).message,
    );
  }

  await messagingService
    .processOutput()
    .catch((error) => console.error('Error processing output', error));
}

bootstrap().catch((error) => {
  console.error('Fatal error during bootstrap:', error);
  process.exit(1);
});
