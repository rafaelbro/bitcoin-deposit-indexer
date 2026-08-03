import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository, getDataSourceToken } from '@nestjs/typeorm';
import { CustomerUtxo } from 'src/entities/customerUtxo.entity';
import { UnknownUtxo } from 'src/entities/unknownUtxo.entity';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class UtxoDatabaseService {
  constructor(
    @InjectRepository(CustomerUtxo)
    private readonly customerUtxosRepository: Repository<CustomerUtxo>,
    @InjectRepository(UnknownUtxo)
    private readonly unknownUtxosRepository: Repository<UnknownUtxo>,
    @Inject(getDataSourceToken()) private readonly dataSource: DataSource,
  ) {}
  private readonly RETRY_AMOUNT = 3;
  private readonly RETRY_BASE_DELAY_MS = 300;
  private readonly RETRY_MAX_DELAY_MS = 3000;
  private readonly logger = new Logger(UtxoDatabaseService.name);

  private computeBackoffDelayMs(attempt: number): number {
    const exponentialDelay = Math.min(
      this.RETRY_MAX_DELAY_MS,
      this.RETRY_BASE_DELAY_MS * 2 ** attempt,
    );
    return Math.random() * exponentialDelay;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async insertUTXOs(
    customerUtxos: CustomerUtxo[],
    unknownUtxos: UnknownUtxo[],
  ) {
    for (let attempt = 0; attempt < this.RETRY_AMOUNT; attempt++) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction('READ COMMITTED');

      try {
        await Promise.all([
          queryRunner.manager.upsert(CustomerUtxo, customerUtxos, [
            'txHash',
            'vout',
          ]),
          queryRunner.manager.upsert(UnknownUtxo, unknownUtxos, [
            'txHash',
            'vout',
          ]),
        ]);

        await queryRunner.commitTransaction();
        return;
      } catch (error) {
        await queryRunner.rollbackTransaction();
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (error as { code: string }).code === '40P01'
        ) {
          this.logger.warn(
            `Deadlock detected, retrying (${attempt + 1}/${this.RETRY_AMOUNT})...`,
          );
          await this.delay(this.computeBackoffDelayMs(attempt));
        } else {
          this.logger.error('Transaction failed:', error);
          throw error;
        }
      } finally {
        await queryRunner.release();
      }
    }
  }

  async removeUTXOs(removedUtxos: { txHash: string; vout: number }[]) {
    if (removedUtxos.length === 0) {
      return;
    }
    const txHashes = removedUtxos.map((utxo) => utxo.txHash);
    const vouts = removedUtxos.map((utxo) => utxo.vout);

    for (let attempt = 0; attempt < this.RETRY_AMOUNT; attempt++) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction('READ COMMITTED');

      try {
        await Promise.all([
          queryRunner.query(
            `DELETE FROM "customerUtxo" c
             USING UNNEST($1::varchar[], $2::int[]) AS removed("txHash", "vout")
             WHERE c."txHash" = removed."txHash" AND c."vout" = removed."vout"`,
            [txHashes, vouts],
          ),
          queryRunner.query(
            `DELETE FROM "unknownUtxo" c
             USING UNNEST($1::varchar[], $2::int[]) AS removed("txHash", "vout")
             WHERE c."txHash" = removed."txHash" AND c."vout" = removed."vout"`,
            [txHashes, vouts],
          ),
        ]);

        await queryRunner.commitTransaction();
        return;
      } catch (error) {
        await queryRunner.rollbackTransaction();
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (error as { code: string }).code === '40P01'
        ) {
          this.logger.warn(
            `Deadlock detected, retrying (${attempt + 1}/${this.RETRY_AMOUNT})...`,
          );
          await this.delay(this.computeBackoffDelayMs(attempt));
        } else {
          this.logger.error('Transaction failed while removing UTXOs:', error);
          throw error;
        }
      } finally {
        await queryRunner.release();
      }
    }
  }

  async getSmallestAndLargestDeposit(): Promise<{
    smallest_deposit: number;
    largest_deposit: number;
  }> {
    try {
      const [customerAgg, unknownAgg] = await Promise.all([
        this.customerUtxosRepository
          .createQueryBuilder('utxo')
          .select('MIN(utxo.txValue)', 'min')
          .addSelect('MAX(utxo.txValue)', 'max')
          .getRawOne<{ min: string | null; max: string | null }>(),
        this.unknownUtxosRepository
          .createQueryBuilder('utxo')
          .select('MIN(utxo.txValue)', 'min')
          .addSelect('MAX(utxo.txValue)', 'max')
          .getRawOne<{ min: string | null; max: string | null }>(),
      ]);

      const mins = [customerAgg?.min, unknownAgg?.min]
        .filter((value): value is string => value !== null && value !== undefined)
        .map(Number);
      const maxs = [customerAgg?.max, unknownAgg?.max]
        .filter((value): value is string => value !== null && value !== undefined)
        .map(Number);

      return {
        smallest_deposit: mins.length > 0 ? Math.min(...mins) : 0,
        largest_deposit: maxs.length > 0 ? Math.max(...maxs) : 0,
      };
    } catch (e) {
      this.logger.error('Error fetching deposits:', e);
      throw e;
    }
  }

  async getCountAndTotalSumFromUnknownAddresses(): Promise<{
    unknown_count: number;
    unknown_sum: number;
  }> {
    try {
      const result = await this.unknownUtxosRepository
        .createQueryBuilder('utxo')
        .select('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(utxo.txValue), 0)', 'sum')
        .getRawOne<{ count: string; sum: string | null }>();

      return {
        unknown_count: parseInt(result?.count ?? '0', 10),
        unknown_sum: parseInt(result?.sum ?? '0', 10),
      };
    } catch (e) {
      this.logger.error('Error fetching unknown addresses data:', e);
      throw e;
    }
  }
}
