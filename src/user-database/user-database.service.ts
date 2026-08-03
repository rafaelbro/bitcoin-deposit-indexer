import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/entities/user.entity';
import { UserSummary } from 'src/entities/userSummary.entity';
import { Repository } from 'typeorm';

@Injectable()
export class UserDatabaseService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(UserSummary)
    private readonly userSummary: Repository<UserSummary>,
  ) {}
  private readonly logger = new Logger(UserDatabaseService.name);

  async saveUsers(user: User[]): Promise<User[] | string> {
    try {
      return this.userRepository.save(user);
    } catch (e) {
      this.logger.log(e);
      throw e;
    }
  }

  async getUserSummary(user: User): Promise<UserSummary | null> {
    try {
      return await this.userSummary.findOne({
        where: { userAddress: user.userAddress },
      });
    } catch (e) {
      this.logger.error(e);
      throw e;
    }
  }

  async getUsersSummary(): Promise<UserSummary[]> {
    try {
      return this.userSummary.find({});
    } catch (e) {
      this.logger.error(e);
      throw e;
    }
  }

  async getUniqueAddresses(): Promise<User[]> {
    try {
      return this.userRepository.find();
    } catch (e) {
      this.logger.error(e);
      throw e;
    }
  }
}
