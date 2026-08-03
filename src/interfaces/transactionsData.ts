import { Transaction } from './transaction';

export interface TransactionsData {
  transactions: Transaction[];
  removed?: Transaction[];
  lastblock: string; // The hash of the block (target_confirmations-1) from the best block.
}
