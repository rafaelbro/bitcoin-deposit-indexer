import { Injectable, Logger } from '@nestjs/common';
import { CacheManagerService } from 'src/cache-manager/cache-manager.service';
import { DataTransformationService } from 'src/data-transformation/data-transformation.service';
import { CustomerUtxo } from 'src/entities/customerUtxo.entity';
import { UnknownUtxo } from 'src/entities/unknownUtxo.entity';
import { User } from 'src/entities/user.entity';
import { UserSummary } from 'src/entities/userSummary.entity';
import { TransactionStatus } from 'src/enum/transactionStatus';
import { Transaction } from 'src/interfaces/transaction';
import { TransactionsData } from 'src/interfaces/transactionsData';
import { UserDatabaseService } from 'src/user-database/user-database.service';
import { UtxoDatabaseService } from 'src/utxo-database/utxo-database.service';

@Injectable()
export class BitcoinManagerService {
  constructor(
    private readonly userDatabaseService: UserDatabaseService,
    private readonly utxoDatabaseService: UtxoDatabaseService,
    private readonly dataTransformationService: DataTransformationService,
    private readonly cacheManagerService: CacheManagerService,
  ) {}
  private readonly NUMBER_OF_REQUIRED_CONFIRMATIONS = 6;
  private readonly logger = new Logger(BitcoinManagerService.name);

  private readonly TRANSACTION_CATEGORY_FOR_DEPOSIT = 'receive';
  private transformUtxos = <T>(transactions: Transaction[]): T[] =>
    transactions.map(
      (transaction) =>
        ({
          txHash: transaction.txid,
          txValue:
            this.dataTransformationService.formatFromDecimalToIntegerString(
              transaction.amount,
            ),
          userAddress: transaction.address,
          transactionStatus: TransactionStatus.UNSPENT,
          vout: transaction.vout,
        }) as T,
    );

  async processRawJSONforDeposit(data: string) {
    const normalizedData =
      this.dataTransformationService.rawJsonNumberToStringConverter(data);
    const transactionData: TransactionsData = JSON.parse(
      normalizedData,
    ) as TransactionsData;
    await this.clientFiltering(transactionData);
  }

  async clientFiltering(data: TransactionsData) {
    await this.removeReorgedDeposits(data.removed);

    const uniqueUserAddresses = await this.getCachedData(
      'Users',
      () => this.userDatabaseService.getUniqueAddresses(),
      3600,
    );
    if (this.isUserArray(uniqueUserAddresses)) {
      const addressSet = new Set<string>(
        uniqueUserAddresses.map((user) => user.userAddress),
      );
      const { customerUtxos, unknownUtxos } = this.filterCustomerDeposits(
        data,
        addressSet,
      );
      this.checkWalletConflicts(customerUtxos, unknownUtxos);
      await this.saveDeposits(customerUtxos, unknownUtxos);
    }
  }

  private async removeReorgedDeposits(removed?: Transaction[]) {
    if (!removed || removed.length === 0) {
      return;
    }
    const removedUtxos = removed.map((tx) => ({
      txHash: tx.txid,
      vout: tx.vout,
    }));
    await this.utxoDatabaseService.removeUTXOs(removedUtxos);
    this.cacheManagerService
      .delKey('UserSummary')
      .catch((error) => this.logger.error('Error deleting cache key', error));
  }

  private async getCachedData<T>(
    cacheKey: string,
    dbFunction: () => Promise<T>,
    ttl: number,
  ): Promise<T> {
    const cachedData: unknown = await this.cacheManagerService.getKey(cacheKey);
    if (Array.isArray(cachedData) && cachedData.length > 0) {
      return cachedData as T;
    }
    if (cachedData) {
      return cachedData as T;
    }
    const dbData = await dbFunction();
    await this.cacheManagerService.setKey(cacheKey, dbData, ttl);
    return dbData;
  }

  private async saveDeposits(
    customerUtxos: Transaction[],
    unknownUtxos: Transaction[],
  ) {
    const unknown: UnknownUtxo[] =
      this.transformUtxos<UnknownUtxo>(unknownUtxos);
    const customer: CustomerUtxo[] =
      this.transformUtxos<CustomerUtxo>(customerUtxos);
    if (unknown.length > 0 || customer.length > 0) {
      await this.utxoDatabaseService.insertUTXOs(customer, unknown);
    }
    if (customer && customer.length > 0) {
      this.cacheManagerService
        .delKey('UserSummary')
        .catch((error) => this.logger.error('Error deleting cache key', error));
    }
  }

  async processUserSummary() {
    const usersSummary: UserSummary[] = await this.getCachedData<UserSummary[]>(
      'UserSummary',
      () => this.userDatabaseService.getUsersSummary(),
      600,
    );
    const usersSummaryMap: Record<string, { count: number; sum: string }> =
      usersSummary.reduce(
        (acc, user) => {
          acc[user.userName] = {
            count: user.transactionCount,
            sum: this.dataTransformationService.formatDecimalString(
              user.userBalance,
            ),
          };
          return acc;
        },
        {} as Record<string, { count: number; sum: string }>,
      );

    const orderedNames = [
      'Customer A. Ito',
      'Customer B. Reyes',
      'Customer C. Okafor',
      'Customer D. Novak',
      'Customer E. Lindqvist',
      'Customer F. Alvarez',
      'Customer G. Petrov',
    ];
    const output = orderedNames.map((name) => {
      const deposit = usersSummaryMap[name] || { count: 0, sum: 0 };
      return `Deposited for ${name}: count=${deposit.count} sum=${deposit.sum}`;
    });
    const { unknown_count = 0, unknown_sum = 0 } =
      await this.utxoDatabaseService.getCountAndTotalSumFromUnknownAddresses();
    const { smallest_deposit = 0, largest_deposit = 0 } =
      await this.utxoDatabaseService.getSmallestAndLargestDeposit();
    output.push(
      `Deposited without reference: count=${unknown_count} sum=${this.dataTransformationService.formatDecimalString(unknown_sum)}`,
    );
    output.push(
      `Smallest valid deposit: ${this.dataTransformationService.formatDecimalString(smallest_deposit)}`,
    );
    output.push(
      `Largest valid deposit: ${this.dataTransformationService.formatDecimalString(largest_deposit)}`,
    );
    console.log(output.join('\n'));
  }

  private filterCustomerDeposits(
    transactionsData: TransactionsData,
    allowedAddresses: Set<string>,
  ): { customerUtxos: Transaction[]; unknownUtxos: Transaction[] } {
    const customerUtxos: Transaction[] = [];
    const unknownUtxos: Transaction[] = [];
    for (const tx of transactionsData.transactions) {
      if (
        tx.category === this.TRANSACTION_CATEGORY_FOR_DEPOSIT &&
        tx.confirmations > this.NUMBER_OF_REQUIRED_CONFIRMATIONS - 1
      ) {
        if (allowedAddresses.has(tx.address)) {
          customerUtxos.push(tx);
        } else {
          unknownUtxos.push(tx);
        }
      }
    }
    return { customerUtxos, unknownUtxos };
  }

  private checkWalletConflicts(
    customerUtxos: Transaction[],
    unknownUtxos: Transaction[],
  ) {
    for (const transaction of customerUtxos) {
      if (transaction.walletconflicts?.length > 0) {
        this.logger.error(
          'Check conflict for customer with transaction: ',
          transaction.txid,
        );
      }
    }
    for (const transaction of unknownUtxos) {
      if (transaction.walletconflicts?.length > 0) {
        this.logger.error('Check conflict for transaction: ', transaction.txid);
      }
    }
  }

  private isUserArray(value: User[] | string): value is User[] {
    return (
      value.length > 0 &&
      typeof value[0] === 'object' &&
      'userAddress' in value[0]
    );
  }
}
