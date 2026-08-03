import { TransactionStatus } from 'src/enum/transactionStatus';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('customerUtxo')
@Index(['userAddress', 'transactionStatus'])
@Index(['txValue'])
export class CustomerUtxo {
  @PrimaryColumn({ type: 'varchar', length: 200 })
  txHash: string;

  @PrimaryColumn({ type: 'int' })
  vout: number;

  @ManyToOne(() => User, (user) => user.userAddress)
  @JoinColumn({ name: 'userAddress' })
  userAddress: string;

  @Column({ type: 'bigint' })
  txValue: number;

  @Column({ type: 'enum', enum: TransactionStatus })
  transactionStatus: TransactionStatus;

  @CreateDateColumn()
  createdAt?: Date;

  @UpdateDateColumn()
  updatedAt?: Date;
}
