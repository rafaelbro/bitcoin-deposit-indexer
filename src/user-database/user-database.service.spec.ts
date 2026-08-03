import { Test, TestingModule } from '@nestjs/testing';
import { UserDatabaseService } from './user-database.service';
import { User } from 'src/entities/user.entity';
import { UserSummary } from 'src/entities/userSummary.entity';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';

jest.mock('@nestjs/microservices', () => ({
  ...jest.requireActual('@nestjs/microservices'),
  Transport: { RMQ: 'rmq' },
}));

describe('UserDatabaseService', () => {
  let service: UserDatabaseService;
  let userRepository: Repository<User>;
  let userSummaryRepository: Repository<UserSummary>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserDatabaseService,
        {
          provide: getRepositoryToken(User),
          useClass: Repository, 
        },
        {
          provide: getRepositoryToken(UserSummary),
          useClass: Repository, 
        },
      ],
    }).compile();

    service = module.get<UserDatabaseService>(UserDatabaseService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    userSummaryRepository = module.get<Repository<UserSummary>>(
      getRepositoryToken(UserSummary),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('saveUsers', () => {
    it('should save users successfully', async () => {
      const mockUsers: User[] = [
        { userName: '1', userAddress: '0x123' },
        { userName: '2', userAddress: '0x456' },
      ];

      jest
        .spyOn(userRepository, 'save')
        .mockResolvedValue(Promise.resolve(mockUsers) as any);

      const result = await service.saveUsers(mockUsers);

      expect(userRepository.save).toHaveBeenCalledWith(mockUsers);
      expect(result).toEqual(mockUsers);
    });

    it('should throw an error if saving users fails', async () => {
      const mockUsers: User[] = [{ userName: '1', userAddress: '0x123' }];

      const error = new Error('Database error');
      jest.spyOn(userRepository, 'save').mockRejectedValue(error);

      await expect(service.saveUsers(mockUsers)).rejects.toThrow(error);
    });
  });

  describe('getUserSummary', () => {
    it('should return user summary if found', async () => {
      const mockUser: User = { userName: '1', userAddress: '0x123' };
      const mockUserSummary: UserSummary = {
        userName: '1',
        userAddress: '0x123',
        userBalance: 100,
        transactionCount: 2,
        user: { userName: '1', userAddress: '0x123' },
      };

      jest
        .spyOn(userSummaryRepository, 'findOne')
        .mockResolvedValue(mockUserSummary);

      const result = await service.getUserSummary(mockUser);

      expect(userSummaryRepository.findOne).toHaveBeenCalledWith({
        where: { userAddress: mockUser.userAddress },
      });
      expect(result).toEqual(mockUserSummary);
    });

    it('should return null if user summary is not found', async () => {
      const mockUser: User = { userName: '1', userAddress: '0x123' };

      jest.spyOn(userSummaryRepository, 'findOne').mockResolvedValue(null);

      const result = await service.getUserSummary(mockUser);

      expect(userSummaryRepository.findOne).toHaveBeenCalledWith({
        where: { userAddress: mockUser.userAddress },
      });
      expect(result).toBeNull();
    });

    it('should throw an error if fetching user summary fails', async () => {
      const mockUser: User = { userName: '1', userAddress: '0x123' };
      const error = new Error('Database error');

      jest.spyOn(userSummaryRepository, 'findOne').mockRejectedValue(error);

      await expect(service.getUserSummary(mockUser)).rejects.toThrow(error);
    });
  });

  describe('getUsersSummary', () => {
    it('should return all user summaries', async () => {
      const mockUserSummaries: UserSummary[] = [
        {
          userName: '1',
          userAddress: '0x123',
          user: { userName: '1', userAddress: '0x123' },
          transactionCount: 2,
          userBalance: 10,
        },
        {
          userName: '2',
          userAddress: '0x456',
          user: { userName: '1', userAddress: '0x123' },
          transactionCount: 2,
          userBalance: 10,
        },
      ];

      jest
        .spyOn(userSummaryRepository, 'find')
        .mockResolvedValue(mockUserSummaries);

      const result = await service.getUsersSummary();

      expect(userSummaryRepository.find).toHaveBeenCalledWith({});
      expect(result).toEqual(mockUserSummaries);
    });

    it('should throw an error if fetching user summaries fails', async () => {
      const error = new Error('Database error');
      jest.spyOn(userSummaryRepository, 'find').mockRejectedValue(error);

      await expect(service.getUsersSummary()).rejects.toThrow(error);
    });
  });

  describe('getUniqueAddresses', () => {
    it('should return all unique user addresses', async () => {
      const mockUsers: User[] = [
        { userName: '1', userAddress: '0x123' },
        { userName: '2', userAddress: '0x456' },
      ];

      jest.spyOn(userRepository, 'find').mockResolvedValue(mockUsers);

      const result = await service.getUniqueAddresses();

      expect(userRepository.find).toHaveBeenCalled();
      expect(result).toEqual(mockUsers);
    });

    it('should throw an error if fetching unique addresses fails', async () => {
      const error = new Error('Database error');
      jest.spyOn(userRepository, 'find').mockRejectedValue(error);

      await expect(service.getUniqueAddresses()).rejects.toThrow(error);
    });
  });
});
