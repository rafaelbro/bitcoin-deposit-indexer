import { Module } from '@nestjs/common';
import { UtxoDatabaseService } from './utxo-database.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerUtxo } from 'src/entities/customerUtxo.entity';
import { UnknownUtxo } from 'src/entities/unknownUtxo.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerUtxo, UnknownUtxo])],
  providers: [UtxoDatabaseService],
  exports: [UtxoDatabaseService],
})
export class UtxoDatabaseModule {}
