import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('userSummary')
export class UserSummary {
  @PrimaryColumn({ type: 'varchar', length: 200 })
  userAddress: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userAddress' })
  user: User;

  @Column({ type: 'varchar', length: 200 })
  userName: string;

  @Column({ type: 'bigint', default: 0 })
  userBalance: number;

  @Column({ type: 'integer', default: 0 })
  transactionCount: number;

  @CreateDateColumn()
  createdAt?: Date;

  @UpdateDateColumn()
  updatedAt?: Date;
}
