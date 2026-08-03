import * as fs from 'fs';
import * as path from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { BitcoinManagerService } from '../src/bitcoin-manager/bitcoin-manager.service';
import { DataTransformationService } from '../src/data-transformation/data-transformation.service';
import { UserDatabaseService } from '../src/user-database/user-database.service';
import { UtxoDatabaseService } from '../src/utxo-database/utxo-database.service';
import { CacheManagerService } from '../src/cache-manager/cache-manager.service';

const KNOWN_CUSTOMERS = [
  {
    userAddress: 'mvd6qFeVkqH6MNAS2Y2cLifbdaX5XUkbZJ',
    userName: 'Customer A. Ito',
  },
  { userAddress: 'mmFFG4jqAtw9MoCC88hw5FNfreQWuEHADp', userName: 'Customer B. Reyes' },
  {
    userAddress: 'mzzg8fvHXydKs8j9D2a8t7KpSXpGgAnk4n',
    userName: 'Customer C. Okafor',
  },
  { userAddress: '2N1SP7r92ZZJvYKG2oNtzPwYnzw62up7mTo', userName: 'Customer D. Novak' },
  {
    userAddress: 'mutrAf4usv3HKNdpLwVD4ow2oLArL6Rez8',
    userName: 'Customer E. Lindqvist',
  },
  { userAddress: 'miTHhiX3iFhVnAEecLjybxvV5g8mKYTtnM', userName: 'Customer F. Alvarez' },
  { userAddress: 'mvcyJMiAcSXKAEsQxbW9TYZ369rsMG6rVV', userName: 'Customer G. Petrov' },
];

/**
 * In-memory stand-in for the customerUtxo/unknownUtxo/userSummary tables and the
 * AFTER INSERT/DELETE triggers that keep userSummary in sync (upsert-by-key,
 * recompute-on-change). This lets the test drive the real
 * BitcoinManagerService/DataTransformationService pipeline end-to-end
 * (raw JSON -> filter -> aggregate -> printed summary) without requiring
 * Postgres/Redis/RabbitMQ to be running.
 */
class InMemoryUtxoStore {
  private readonly customerUtxos = new Map<
    string,
    { userAddress: string; txValue: number }
  >();
  private readonly unknownUtxos = new Map<string, { txValue: number }>();

  private key(txHash: string, vout: number): string {
    return `${txHash}:${vout}`;
  }

  upsert(
    customer: {
      txHash: string;
      vout: number;
      userAddress: string;
      txValue: number;
    }[],
    unknown: { txHash: string; vout: number; txValue: number }[],
  ): void {
    for (const utxo of customer) {
      this.customerUtxos.set(this.key(utxo.txHash, utxo.vout), {
        userAddress: utxo.userAddress,
        txValue: utxo.txValue,
      });
    }
    for (const utxo of unknown) {
      this.unknownUtxos.set(this.key(utxo.txHash, utxo.vout), {
        txValue: utxo.txValue,
      });
    }
  }

  remove(removed: { txHash: string; vout: number }[]): void {
    for (const { txHash, vout } of removed) {
      const key = this.key(txHash, vout);
      this.customerUtxos.delete(key);
      this.unknownUtxos.delete(key);
    }
  }

  summaryFor(userAddress: string): { sum: number; count: number } {
    let sum = 0;
    let count = 0;
    for (const utxo of this.customerUtxos.values()) {
      if (utxo.userAddress === userAddress) {
        sum += utxo.txValue;
        count++;
      }
    }
    return { sum, count };
  }

  unknownTotals(): { sum: number; count: number } {
    let sum = 0;
    let count = 0;
    for (const utxo of this.unknownUtxos.values()) {
      sum += utxo.txValue;
      count++;
    }
    return { sum, count };
  }

  minMax(): { smallest: number; largest: number } {
    const values = [
      ...[...this.customerUtxos.values()].map((u) => u.txValue),
      ...[...this.unknownUtxos.values()].map((u) => u.txValue),
    ];
    if (values.length === 0) {
      return { smallest: 0, largest: 0 };
    }
    return { smallest: Math.min(...values), largest: Math.max(...values) };
  }
}

function buildTestModule(store: InMemoryUtxoStore): Promise<TestingModule> {
  const fakeCache = new Map<string, unknown>();

  const fakeCacheManagerService: Partial<CacheManagerService> = {
    getKey: (key: string) => Promise.resolve(fakeCache.get(key) ?? null),
    setKey: (key: string, value: unknown) => {
      fakeCache.set(key, value);
      return Promise.resolve();
    },
    delKey: (key: string) => Promise.resolve(fakeCache.delete(key)),
  };

  const fakeUserDatabaseService: Partial<UserDatabaseService> = {
    getUniqueAddresses: () =>
      Promise.resolve(
        KNOWN_CUSTOMERS.map((c) => ({ userAddress: c.userAddress })) as any,
      ),
    getUsersSummary: () =>
      Promise.resolve(
        KNOWN_CUSTOMERS.map((c) => {
          const { sum, count } = store.summaryFor(c.userAddress);
          return {
            userAddress: c.userAddress,
            userName: c.userName,
            userBalance: sum,
            transactionCount: count,
          } as any;
        }),
      ),
  };

  const fakeUtxoDatabaseService: Partial<UtxoDatabaseService> = {
    insertUTXOs: (customerUtxos: any, unknownUtxos: any) => {
      store.upsert(customerUtxos, unknownUtxos);
      return Promise.resolve();
    },
    removeUTXOs: (removed: any) => {
      store.remove(removed);
      return Promise.resolve();
    },
    getCountAndTotalSumFromUnknownAddresses: () => {
      const { sum, count } = store.unknownTotals();
      return Promise.resolve({ unknown_count: count, unknown_sum: sum });
    },
    getSmallestAndLargestDeposit: () => {
      const { smallest, largest } = store.minMax();
      return Promise.resolve({
        smallest_deposit: smallest,
        largest_deposit: largest,
      });
    },
  };

  return Test.createTestingModule({
    providers: [
      BitcoinManagerService,
      DataTransformationService,
      { provide: CacheManagerService, useValue: fakeCacheManagerService },
      { provide: UserDatabaseService, useValue: fakeUserDatabaseService },
      { provide: UtxoDatabaseService, useValue: fakeUtxoDatabaseService },
    ],
  }).compile();
}

describe('Deposit processing pipeline (e2e)', () => {
  let service: BitcoinManagerService;

  beforeEach(async () => {
    const module = await buildTestModule(new InMemoryUtxoStore());
    service = module.get(BitcoinManagerService);
  });

  async function processFixturesAndCaptureSummary(): Promise<string[]> {
    const rawData1 = fs.readFileSync(
      path.join(__dirname, '../fixtures/sample-snapshot-1.json'),
      'utf8',
    );
    const rawData2 = fs.readFileSync(
      path.join(__dirname, '../fixtures/sample-snapshot-2.json'),
      'utf8',
    );

    await service.processRawJSONforDeposit(rawData1);
    await service.processRawJSONforDeposit(rawData2);

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await service.processUserSummary();

    const output = consoleSpy.mock.calls[0][0] as string;
    consoleSpy.mockRestore();

    return output.split('\n');
  }

  it('processes both fixture files and prints the exact required summary', async () => {
    const lines = await processFixturesAndCaptureSummary();

    expect(lines).toEqual([
      'Deposited for Customer A. Ito: count=35 sum=183.00000000',
      'Deposited for Customer B. Reyes: count=18 sum=97.00000000',
      'Deposited for Customer C. Okafor: count=19 sum=97.49000000',
      'Deposited for Customer D. Novak: count=16 sum=77.48000000',
      'Deposited for Customer E. Lindqvist: count=27 sum=131.93253000',
      'Deposited for Customer F. Alvarez: count=22 sum=1210.60058269',
      'Deposited for Customer G. Petrov: count=16 sum=827.64088710',
      'Deposited without reference: count=23 sum=1151.88738228',
      'Smallest valid deposit: 0.00000000',
      'Largest valid deposit: 99.61064066',
    ]);
  });

  it('matches the exact 10-line summary format', async () => {
    const lines = await processFixturesAndCaptureSummary();
    const decimalPattern = '\\d+\\.\\d{8}';

    const expectedPatterns = [
      ...KNOWN_CUSTOMERS.map(
        (c) =>
          new RegExp(`^Deposited for ${c.userName}: count=\\d+ sum=${decimalPattern}$`),
      ),
      new RegExp(`^Deposited without reference: count=\\d+ sum=${decimalPattern}$`),
      new RegExp(`^Smallest valid deposit: ${decimalPattern}$`),
      new RegExp(`^Largest valid deposit: ${decimalPattern}$`),
    ];

    expect(lines).toHaveLength(10);
    lines.forEach((line, index) => {
      expect(line).toMatch(expectedPatterns[index]);
    });
  });
});
