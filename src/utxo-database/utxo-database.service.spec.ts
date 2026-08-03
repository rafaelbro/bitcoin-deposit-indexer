import { Test, TestingModule } from '@nestjs/testing';
import { UtxoDatabaseService } from './utxo-database.service';
import { CustomerUtxo } from 'src/entities/customerUtxo.entity';
import { UnknownUtxo } from 'src/entities/unknownUtxo.entity';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';

function makeQueryBuilder(rawOneValue: unknown) {
  const queryBuilder: any = {};
  queryBuilder.select = jest.fn().mockReturnValue(queryBuilder);
  queryBuilder.addSelect = jest.fn().mockReturnValue(queryBuilder);
  queryBuilder.getRawOne = jest.fn().mockResolvedValue(rawOneValue);
  return queryBuilder;
}

describe('UtxoDatabaseService', () => {
  let service: UtxoDatabaseService;
  let customerUtxosRepository: Repository<CustomerUtxo>;
  let unknownUtxosRepository: Repository<UnknownUtxo>;
  let dataSource: DataSource;
  let queryRunner: QueryRunner;

  beforeEach(async () => {
    const mockQueryRunner: Partial<QueryRunner> = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest.fn().mockResolvedValue(undefined),
      manager: {
        upsert: jest.fn().mockResolvedValue(undefined),
      } as any,
    };

    const mockDataSource = {
      query: jest.fn(),
      createQueryRunner: jest
        .fn()
        .mockReturnValue(mockQueryRunner as QueryRunner),
    };

    const mockCustomerUtxosRepository = {
      upsert: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest
        .fn()
        .mockReturnValue(makeQueryBuilder({ min: null, max: null })),
    };

    const mockUnknownUtxosRepository = {
      upsert: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest
        .fn()
        .mockReturnValue(makeQueryBuilder({ min: null, max: null })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UtxoDatabaseService,
        {
          provide: getRepositoryToken(CustomerUtxo),
          useValue: mockCustomerUtxosRepository,
        },
        {
          provide: getRepositoryToken(UnknownUtxo),
          useValue: mockUnknownUtxosRepository,
        },
        {
          provide: getDataSourceToken(),
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<UtxoDatabaseService>(UtxoDatabaseService);
    customerUtxosRepository = module.get<Repository<CustomerUtxo>>(
      getRepositoryToken(CustomerUtxo),
    );
    unknownUtxosRepository = module.get<Repository<UnknownUtxo>>(
      getRepositoryToken(UnknownUtxo),
    );
    dataSource = module.get<DataSource>(getDataSourceToken());
    queryRunner = mockQueryRunner as QueryRunner;
  });

  describe('insertUTXOs', () => {
    it('should execute customer and unknown UTXO inserts within a transaction', async () => {
      const customerUtxos: CustomerUtxo[] = [
        { txHash: 'hash1', txValue: 100, vout: 0 },
      ] as CustomerUtxo[];
      const unknownUtxos: UnknownUtxo[] = [
        { txHash: 'hash2', txValue: 200, vout: 1 },
      ] as UnknownUtxo[];

      await service.insertUTXOs(customerUtxos, unknownUtxos);

      expect(queryRunner.startTransaction).toHaveBeenCalled();
      expect(queryRunner.manager.upsert).toHaveBeenCalledWith(
        CustomerUtxo,
        customerUtxos,
        ['txHash', 'vout'],
      );
      expect(queryRunner.manager.upsert).toHaveBeenCalledWith(
        UnknownUtxo, 
        unknownUtxos,
        ['txHash', 'vout'],
      );      
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
    });

    it('should rollback transaction on failure', async () => {
      const customerUtxos: CustomerUtxo[] = [
        { txHash: 'hash1', txValue: 100, vout: 0 },
      ] as CustomerUtxo[];
      const unknownUtxos: UnknownUtxo[] = [
        { txHash: 'hash2', txValue: 200, vout: 1 },
      ] as UnknownUtxo[];
      const error = new Error('Transaction failed');

      jest.spyOn(queryRunner.manager, 'upsert')
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error);

      await expect(
        service.insertUTXOs(customerUtxos, unknownUtxos),
      ).rejects.toThrow(error);

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
    });

    it('should retry with backoff on deadlock and succeed on a later attempt', async () => {
      const customerUtxos: CustomerUtxo[] = [
        { txHash: 'hash1', txValue: 100, vout: 0 },
      ] as CustomerUtxo[];
      const unknownUtxos: UnknownUtxo[] = [
        { txHash: 'hash2', txValue: 200, vout: 1 },
      ] as UnknownUtxo[];
      const deadlockError = { code: '40P01' };

      jest
        .spyOn(service as any, 'delay')
        .mockResolvedValue(undefined);
      (jest.spyOn(queryRunner.manager, 'upsert') as unknown as jest.Mock)
        .mockRejectedValueOnce(deadlockError)
        .mockRejectedValueOnce(deadlockError)
        .mockRejectedValueOnce(deadlockError)
        .mockRejectedValueOnce(deadlockError)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      await service.insertUTXOs(customerUtxos, unknownUtxos);

      expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(2);
      expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(service['delay']).toHaveBeenCalledTimes(2);
    });
  });

  describe('computeBackoffDelayMs', () => {
    afterEach(() => {
      jest.spyOn(global.Math, 'random').mockRestore();
    });

    it('should grow exponentially with the attempt number', () => {
      jest.spyOn(global.Math, 'random').mockReturnValue(1);

      expect(service['computeBackoffDelayMs'](0)).toBe(300);
      expect(service['computeBackoffDelayMs'](1)).toBe(600);
      expect(service['computeBackoffDelayMs'](2)).toBe(1200);
    });

    it('should cap the delay at RETRY_MAX_DELAY_MS', () => {
      jest.spyOn(global.Math, 'random').mockReturnValue(1);

      expect(service['computeBackoffDelayMs'](10)).toBe(3000);
    });

    it('should apply jitter so the delay is randomized below the exponential ceiling', () => {
      jest.spyOn(global.Math, 'random').mockReturnValue(0.5);

      expect(service['computeBackoffDelayMs'](1)).toBe(300);
    });
  });

  describe('removeUTXOs', () => {
    it('should do nothing when there are no removed UTXOs', async () => {
      await service.removeUTXOs([]);

      expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    });

    it('should delete matching rows from both tables within a transaction', async () => {
      const removedUtxos = [
        { txHash: 'hash1', vout: 0 },
        { txHash: 'hash2', vout: 1 },
      ];

      await service.removeUTXOs(removedUtxos);

      expect(queryRunner.startTransaction).toHaveBeenCalled();
      expect(queryRunner.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM "customerUtxo"'),
        [
          ['hash1', 'hash2'],
          [0, 1],
        ],
      );
      expect(queryRunner.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM "unknownUtxo"'),
        [
          ['hash1', 'hash2'],
          [0, 1],
        ],
      );
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
    });

    it('should rollback transaction on failure', async () => {
      const removedUtxos = [{ txHash: 'hash1', vout: 0 }];
      const error = new Error('Transaction failed');

      jest
        .spyOn(queryRunner, 'query')
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error);

      await expect(service.removeUTXOs(removedUtxos)).rejects.toThrow(error);

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
    });
  });

  describe('getSmallestAndLargestDeposit', () => {
    it('should return the overall smallest and largest deposit across both tables', async () => {
      (customerUtxosRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        makeQueryBuilder({ min: '10', max: '5000' }),
      );
      (unknownUtxosRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        makeQueryBuilder({ min: '20', max: '10000' }),
      );

      const result = await service.getSmallestAndLargestDeposit();

      expect(customerUtxosRepository.createQueryBuilder).toHaveBeenCalledWith(
        'utxo',
      );
      expect(unknownUtxosRepository.createQueryBuilder).toHaveBeenCalledWith(
        'utxo',
      );
      expect(result).toEqual({ smallest_deposit: 10, largest_deposit: 10000 });
    });

    it('should return zeros when both tables are empty', async () => {
      const result = await service.getSmallestAndLargestDeposit();

      expect(result).toEqual({ smallest_deposit: 0, largest_deposit: 0 });
    });
  });

  describe('getCountAndTotalSumFromUnknownAddresses', () => {
    it('should return count and sum of unknown UTXOs', async () => {
      (unknownUtxosRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        makeQueryBuilder({ count: '5', sum: '500' }),
      );

      const result = await service.getCountAndTotalSumFromUnknownAddresses();

      expect(unknownUtxosRepository.createQueryBuilder).toHaveBeenCalledWith(
        'utxo',
      );
      expect(result).toEqual({ unknown_count: 5, unknown_sum: 500 });
    });
  });
});
