import { Test, TestingModule } from '@nestjs/testing';
import { BitcoinManagerService } from './bitcoin-manager.service';
import { UserDatabaseService } from 'src/user-database/user-database.service';
import { UtxoDatabaseService } from 'src/utxo-database/utxo-database.service';
import { DataTransformationService } from 'src/data-transformation/data-transformation.service';
import { TransactionsData } from 'src/interfaces/transactionsData';
import { CacheManagerService } from 'src/cache-manager/cache-manager.service';

jest.mock('src/user-database/user-database.service');
jest.mock('src/cache-manager/cache-manager.service', () => ({
  CacheManagerService: jest.fn().mockImplementation(() => ({
    getKey: jest.fn().mockResolvedValue(null), 
    setKey: jest.fn().mockResolvedValue(undefined), 
    delKey: jest.fn().mockResolvedValue(undefined), 
  })),
}));

jest.mock('src/utxo-database/utxo-database.service');
jest.mock('src/data-transformation/data-transformation.service');

describe('BitcoinManagerService', () => {
  let service: BitcoinManagerService;
  let cacheManagerService: CacheManagerService;
  let userDatabaseService: UserDatabaseService;
  let utxoDatabaseService: UtxoDatabaseService;
  let dataTransformationService: DataTransformationService;

  const MOCK_TRANSACTION_DATA: TransactionsData = {
    transactions: [
      {
        txid: 'abc123',
        amount: '0.1',
        address: 'addr1',
        vout: 1,
        category: 'receive',
        confirmations: 6,
        blockhash: 'block123',
        blockheight: 100000,
        blockindex: 1,
        blocktime: 1650000000,
        involvesWatchonly: false,
        time: 1650000000,
        timereceived: 1650000001,
        walletconflicts: [],
        'bip125-replaceable': 'yes',
      },
      {
        txid: 'xyz789',
        amount: '0.2',
        address: 'addr2',
        vout: 2,
        category: 'receive',
        confirmations: 6,
        blockhash: 'block456',
        blockheight: 100001,
        blockindex: 2,
        blocktime: 1650000005,
        involvesWatchonly: false,
        time: 1650000005,
        timereceived: 1650000006,
        walletconflicts: [],
        'bip125-replaceable': 'yes',
      },
      {
        txid: 'xyz122',
        amount: '0.3',
        address: 'addr3',
        vout: 2,
        category: 'receive',
        confirmations: 6,
        blockhash: 'block456',
        blockheight: 100001,
        blockindex: 2,
        blocktime: 1650000005,
        involvesWatchonly: false,
        time: 1650000005,
        timereceived: 1650000006,
        walletconflicts: [],
        'bip125-replaceable': 'yes',
      },
      {
        txid: 'xyz123',
        amount: '0.4',
        address: 'addr3',
        vout: 2,
        category: 'receive',
        confirmations: 1,
        blockhash: 'block456',
        blockheight: 100001,
        blockindex: 2,
        blocktime: 1650000005,
        involvesWatchonly: false,
        time: 1650000005,
        timereceived: 1650000006,
        walletconflicts: [],
        'bip125-replaceable': 'yes',
      },
    ],
    lastblock: '000000001',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BitcoinManagerService,
        CacheManagerService,
        DataTransformationService,
        UserDatabaseService,
        UtxoDatabaseService,
      ],
    }).compile();

    service = module.get<BitcoinManagerService>(BitcoinManagerService);
    cacheManagerService = module.get(CacheManagerService);
    dataTransformationService = module.get(DataTransformationService);
    userDatabaseService = module.get(UserDatabaseService);
    utxoDatabaseService = module.get(UtxoDatabaseService);
  });

  describe('processRawJSONforDeposit', () => {
    it('should process JSON and call clientFiltering', async () => {
      const rawData =
        '{"transactions": [{"txid": "abc123", "amount": 0.1, "address": "addr1", "vout": 1, "category": "receive", "confirmations": 6}]}';
      dataTransformationService.rawJsonNumberToStringConverter = jest
        .fn()
        .mockReturnValue(rawData);

      userDatabaseService.getUniqueAddresses = jest
        .fn()
        .mockResolvedValueOnce([
          { userAddress: 'addr1' },
          { userAddress: 'addr2' },
        ]);
      const clientFilteringSpy = jest.spyOn<any, any>(
        service,
        'clientFiltering',
      );

      await service.processRawJSONforDeposit(rawData);

      expect(
        dataTransformationService.rawJsonNumberToStringConverter,
      ).toHaveBeenCalledWith(rawData);
      expect(userDatabaseService.getUniqueAddresses).toHaveBeenCalled();
      expect(clientFilteringSpy).toHaveBeenCalled();
    });

    it('should throw an error for invalid JSON input', async () => {
      const invalidRawData = '{invalidJson: }';

      await expect(
        service.processRawJSONforDeposit(invalidRawData),
      ).rejects.toThrow(SyntaxError); 
    });
  });

  describe('clientFiltering', () => {
    it('should process customer deposits and call saveDeposits', async () => {
      userDatabaseService.getUniqueAddresses = jest
        .fn()
        .mockResolvedValueOnce([{ userAddress: 'addr1' }]);
      const saveDepositsSpy = jest.spyOn<any, any>(service, 'saveDeposits');
      const processUserSummarySpy = jest.spyOn<any, any>(
        service,
        'processUserSummary',
      );
      userDatabaseService.getUniqueAddresses = jest
        .fn()
        .mockResolvedValueOnce([
          { userAddress: 'addr1' },
          { userAddress: 'addr2' },
        ]);

      await service['clientFiltering'](MOCK_TRANSACTION_DATA);

      expect(saveDepositsSpy).toHaveBeenCalledWith(
        [
          {
            txid: 'abc123',
            amount: '0.1',
            address: 'addr1',
            vout: 1,
            category: 'receive',
            confirmations: 6,
            blockhash: 'block123',
            blockheight: 100000,
            blockindex: 1,
            blocktime: 1650000000,
            involvesWatchonly: false,
            time: 1650000000,
            timereceived: 1650000001,
            walletconflicts: [],
            'bip125-replaceable': 'yes',
          },
          {
            txid: 'xyz789',
            amount: '0.2',
            address: 'addr2',
            vout: 2,
            category: 'receive',
            confirmations: 6,
            blockhash: 'block456',
            blockheight: 100001,
            blockindex: 2,
            blocktime: 1650000005,
            involvesWatchonly: false,
            time: 1650000005,
            timereceived: 1650000006,
            walletconflicts: [],
            'bip125-replaceable': 'yes',
          },
        ],
        [
          {
            txid: 'xyz122',
            amount: '0.3',
            address: 'addr3',
            vout: 2,
            category: 'receive',
            confirmations: 6,
            blockhash: 'block456',
            blockheight: 100001,
            blockindex: 2,
            blocktime: 1650000005,
            involvesWatchonly: false,
            time: 1650000005,
            timereceived: 1650000006,
            walletconflicts: [],
            'bip125-replaceable': 'yes',
          },
        ],
      );
    });
    it('should return early if no unique user addresses exist', async () => {
      const spy = jest
        .spyOn<any, any>(service, 'getCachedData')
        .mockResolvedValueOnce([]); 

      const saveDepositsSpy = jest.spyOn<any, any>(service, 'saveDeposits');

      await service['clientFiltering'](MOCK_TRANSACTION_DATA);

      expect(saveDepositsSpy).not.toHaveBeenCalled(); 
    });
    it('should get cached data or fetch from database', async () => {
      cacheManagerService.getKey = jest.fn().mockResolvedValueOnce(null);
      userDatabaseService.getUniqueAddresses = jest
        .fn()
        .mockResolvedValueOnce([{ userAddress: 'test-address' }]);
      cacheManagerService.setKey = jest.fn().mockResolvedValueOnce(undefined);

      const result = await service['getCachedData'](
        'Users',
        userDatabaseService.getUniqueAddresses,
        3600,
      );

      expect(cacheManagerService.getKey).toHaveBeenCalledWith('Users');
      expect(userDatabaseService.getUniqueAddresses).toHaveBeenCalled();
      expect(cacheManagerService.setKey).toHaveBeenCalledWith(
        'Users',
        [{ userAddress: 'test-address' }],
        3600,
      );
      expect(result).toEqual([{ userAddress: 'test-address' }]);
    });
  });

  describe('removeReorgedDeposits', () => {
    it('should do nothing when there are no removed transactions', async () => {
      await service['removeReorgedDeposits'](undefined);
      await service['removeReorgedDeposits']([]);

      expect(utxoDatabaseService.removeUTXOs).not.toHaveBeenCalled();
    });

    it('should remove reorged UTXOs and invalidate the summary cache', async () => {
      utxoDatabaseService.removeUTXOs = jest.fn().mockResolvedValue(undefined);
      cacheManagerService.delKey = jest.fn().mockResolvedValue(undefined);

      await service['removeReorgedDeposits']([
        { ...MOCK_TRANSACTION_DATA.transactions[0], txid: 'reorged1', vout: 3 },
      ]);

      expect(utxoDatabaseService.removeUTXOs).toHaveBeenCalledWith([
        { txHash: 'reorged1', vout: 3 },
      ]);
      expect(cacheManagerService.delKey).toHaveBeenCalledWith('UserSummary');
    });

    it('should call removeReorgedDeposits from clientFiltering with data.removed', async () => {
      const removeReorgedDepositsSpy = jest
        .spyOn<any, any>(service, 'removeReorgedDeposits')
        .mockResolvedValueOnce(undefined);
      userDatabaseService.getUniqueAddresses = jest
        .fn()
        .mockResolvedValueOnce([]);

      const dataWithRemoved = {
        ...MOCK_TRANSACTION_DATA,
        removed: [
          { ...MOCK_TRANSACTION_DATA.transactions[0], txid: 'reorged1', vout: 3 },
        ],
      };

      await service['clientFiltering'](dataWithRemoved);

      expect(removeReorgedDepositsSpy).toHaveBeenCalledWith(
        dataWithRemoved.removed,
      );
    });
  });

  describe('filterCustomerDeposits', () => {
    it('should separate customer and unknown UTXOs', () => {
      const allowedAddresses = new Set(['addr1']);
      const result = service['filterCustomerDeposits'](
        MOCK_TRANSACTION_DATA,
        allowedAddresses,
      );
      expect(result.customerUtxos.length).toBe(1);
      expect(result.unknownUtxos.length).toBe(2);
      expect(result.customerUtxos).toEqual([
        {
          txid: 'abc123',
          amount: '0.1',
          address: 'addr1',
          vout: 1,
          category: 'receive',
          confirmations: 6,
          blockhash: 'block123',
          blockheight: 100000,
          blockindex: 1,
          blocktime: 1650000000,
          involvesWatchonly: false,
          time: 1650000000,
          timereceived: 1650000001,
          walletconflicts: [],
          'bip125-replaceable': 'yes',
        },
      ]);
      expect(result.unknownUtxos).toEqual([
        {
          txid: 'xyz789',
          amount: '0.2',
          address: 'addr2',
          vout: 2,
          category: 'receive',
          confirmations: 6,
          blockhash: 'block456',
          blockheight: 100001,
          blockindex: 2,
          blocktime: 1650000005,
          involvesWatchonly: false,
          time: 1650000005,
          timereceived: 1650000006,
          walletconflicts: [],
          'bip125-replaceable': 'yes',
        },
        {
          txid: 'xyz122',
          amount: '0.3',
          address: 'addr3',
          vout: 2,
          category: 'receive',
          confirmations: 6,
          blockhash: 'block456',
          blockheight: 100001,
          blockindex: 2,
          blocktime: 1650000005,
          involvesWatchonly: false,
          time: 1650000005,
          timereceived: 1650000006,
          walletconflicts: [],
          'bip125-replaceable': 'yes',
        },
      ]);
    });
    it('should return empty lists when no transactions exist', () => {
      const allowedAddresses = new Set(['addr1']);
      const emptyTransactionData: TransactionsData = {
        transactions: [],
        lastblock: '000000002',
      };

      const result = service['filterCustomerDeposits'](
        emptyTransactionData,
        allowedAddresses,
      );

      expect(result.customerUtxos).toEqual([]);
      expect(result.unknownUtxos).toEqual([]);
    });
  });
  describe('saveDeposits', () => {
    it('should not insert UTXOs if both lists are empty', async () => {
      const insertUTXOsSpy = jest.spyOn(utxoDatabaseService, 'insertUTXOs');

      await service['saveDeposits']([], []); // Empty lists

      expect(insertUTXOsSpy).not.toHaveBeenCalled();
    });
  });
  describe('processUserSummary', () => {
    it('should handle missing unknown deposits and smallest/largest deposit values', async () => {
      jest
        .spyOn<any, any>(service, 'getCachedData')
        .mockResolvedValueOnce([
          { userName: 'Customer G. Petrov', transactionCount: 3, userBalance: '1500' },
        ]);
      jest
        .spyOn(utxoDatabaseService, 'getCountAndTotalSumFromUnknownAddresses')       // @ts-ignore required to ignore typesafety in this test
        .mockResolvedValueOnce({});
        
      jest
        .spyOn(utxoDatabaseService, 'getSmallestAndLargestDeposit') // @ts-ignore required to ignore typesafety in this test
        .mockResolvedValueOnce({});

      jest
        .spyOn(dataTransformationService, 'formatDecimalString')
        .mockReturnValueOnce('0.00001500');
      jest
        .spyOn(dataTransformationService, 'formatDecimalString')
        .mockReturnValueOnce('0.00000000');
      jest
        .spyOn(dataTransformationService, 'formatDecimalString')
        .mockReturnValueOnce('0.00000000');
      jest
        .spyOn(dataTransformationService, 'formatDecimalString')
        .mockReturnValueOnce('0.00000000');

      const consoleSpy = jest
        .spyOn(console, 'log')
        .mockImplementation(() => {}); 

      await service.processUserSummary();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Deposited for Customer G. Petrov: count=3 sum=0.00001500'),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Deposited without reference: count=0 sum=0.00000000',
        ),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Smallest valid deposit: 0.00000000'),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Largest valid deposit: 0.00000000'),
      );

      consoleSpy.mockRestore();
    });

    it('should log the correct deposit summary', async () => {
      jest
        .spyOn<any, any>(service, 'getCachedData')
        .mockResolvedValueOnce([
          { userName: 'Customer G. Petrov', transactionCount: 5, userBalance: '1000' },
        ]);
      jest
        .spyOn(utxoDatabaseService, 'getCountAndTotalSumFromUnknownAddresses')
        .mockResolvedValueOnce({ unknown_count: 2, unknown_sum: 500 });
      jest
        .spyOn(utxoDatabaseService, 'getSmallestAndLargestDeposit')
        .mockResolvedValueOnce({
          smallest_deposit: 10,
          largest_deposit: 10000,
        });
      jest
        .spyOn(dataTransformationService, 'formatDecimalString')
        .mockReturnValueOnce('0.00001000');
      jest
        .spyOn(dataTransformationService, 'formatDecimalString')
        .mockReturnValueOnce('0.00000500');
      jest
        .spyOn(dataTransformationService, 'formatDecimalString')
        .mockReturnValueOnce('0.00000010');
      jest
        .spyOn(dataTransformationService, 'formatDecimalString')
        .mockReturnValueOnce('0.00010000');

      const consoleSpy = jest
        .spyOn(console, 'log')
        .mockImplementation(() => {}); 

      await service.processUserSummary();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Deposited for Customer G. Petrov: count=5 sum=0.00001000'),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Deposited without reference: count=2 sum=0.00000500',
        ),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Smallest valid deposit: 0.00000010'),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Largest valid deposit: 0.00010000'),
      );
    });
  });
  describe('getCachedData', () => {
    it('should return cached data if available', async () => {
      cacheManagerService.getKey = jest
        .fn()
        .mockResolvedValueOnce([{ userAddress: 'addrCached' }]);

      const result = await service['getCachedData'](
        'Users',
        userDatabaseService.getUniqueAddresses,
        3600,
      );

      expect(cacheManagerService.getKey).toHaveBeenCalledWith('Users');
      expect(userDatabaseService.getUniqueAddresses).not.toHaveBeenCalled(); 
      expect(result).toEqual([{ userAddress: 'addrCached' }]);
    });

    it('should fetch from DB and set cache if data is missing', async () => {
      cacheManagerService.getKey = jest.fn().mockResolvedValueOnce(null);
      userDatabaseService.getUniqueAddresses = jest
        .fn()
        .mockResolvedValueOnce([{ userAddress: 'addrDB' }]);
      cacheManagerService.setKey = jest.fn().mockResolvedValueOnce(undefined);

      const result = await service['getCachedData'](
        'Users',
        userDatabaseService.getUniqueAddresses,
        3600,
      );

      expect(cacheManagerService.getKey).toHaveBeenCalledWith('Users');
      expect(userDatabaseService.getUniqueAddresses).toHaveBeenCalled(); 
      expect(cacheManagerService.setKey).toHaveBeenCalledWith(
        'Users',
        [{ userAddress: 'addrDB' }],
        3600,
      );
      expect(result).toEqual([{ userAddress: 'addrDB' }]);
    });
  });
});
