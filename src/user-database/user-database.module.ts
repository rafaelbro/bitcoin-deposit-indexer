import { Module } from '@nestjs/common';
import { UserDatabaseService } from './user-database.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/entities/user.entity';
import { UserSummary } from 'src/entities/userSummary.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserSummary])],
  providers: [UserDatabaseService],
  exports: [UserDatabaseService],
})
export class UserDatabaseModule {}
