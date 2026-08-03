import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from 'db/dataSource';
import { MessagingModule } from './messaging/messaging.module';
import { BitcoinManagerModule } from './bitcoin-manager/bitcoin-manager.module';
import { BitcoinManagerService } from './bitcoin-manager/bitcoin-manager.service';
import { MessagingService } from './messaging/messaging.service';
import { UserDatabaseModule } from './user-database/user-database.module';
import { UtxoDatabaseModule } from './utxo-database/utxo-database.module';
import { DataTransformationModule } from './data-transformation/data-transformation.module';
import { CacheManagerModule } from './cache-manager/cache-manager.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forRoot(dataSourceOptions),
    MessagingModule,
    BitcoinManagerModule,
    UserDatabaseModule,
    UtxoDatabaseModule,
    DataTransformationModule,
    CacheManagerModule,
    ConfigModule,
  ],
  controllers: [],
  providers: [AppService, BitcoinManagerService, MessagingService],
})
export class AppModule {}
