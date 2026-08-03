import { Module } from '@nestjs/common';
import { BitcoinManagerService } from './bitcoin-manager.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BitcoinManagerController } from './bitcoin-manager.controller';
import { UserDatabaseModule } from 'src/user-database/user-database.module';
import { UtxoDatabaseModule } from 'src/utxo-database/utxo-database.module';
import { DataTransformationModule } from 'src/data-transformation/data-transformation.module';
import { CacheManagerModule } from 'src/cache-manager/cache-manager.module';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    UserDatabaseModule,
    UtxoDatabaseModule,
    DataTransformationModule,
    CacheManagerModule,
    ClientsModule.registerAsync([
      {
        name: 'BITCOIN_MANAGER_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [
              configService.get<string>('RABBITMQ_URL') ||
                'amqp://user:password@rabbitmq:5672',
            ],
            queue: 'bitcoin_processing',
            queueOptions: { durable: true },
            prefetchCount: 1,
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  providers: [BitcoinManagerService],
  controllers: [BitcoinManagerController],
})
export class BitcoinManagerModule {}
