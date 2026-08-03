import { TransactionStatus } from 'src/enum/transactionStatus';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('unknownUtxo')
@Index(['transactionStatus'])
@Index(['txValue'])
export class UnknownUtxo {
  @PrimaryColumn({ type: 'varchar', length: 200 })
  txHash: string;

  @PrimaryColumn({ type: 'int' })
  vout: number;

  @Column({ type: 'varchar', length: 200 })
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
