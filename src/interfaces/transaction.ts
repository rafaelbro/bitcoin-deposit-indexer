export interface Transaction {
  involvesWatchonly: boolean; // Only returns true if imported addresses were involved in the transaction.
  address: string; // The bitcoin address of the transaction.
  category: 'send' | 'receive' | 'generate' | 'immature' | 'orphan'; // The transaction category.
  amount: string; // The amount in BTC. Negative for 'send', positive for others.
  vout: number; // The vout value.
  fee?: number; // The amount of the fee in BTC. Only available for the 'send' category.
  confirmations: number; // The number of confirmations. Negative means the transaction conflicted.
  generated?: boolean; // Only present if the transaction's only input is a coinbase.
  trusted?: boolean; // Only present if the transaction is considered trusted.
  blockhash: string; // The block hash containing the transaction.
  blockheight: number; // The block height containing the transaction.
  blockindex: number; // The index of the transaction in the block.
  blocktime: number; // The block time in UNIX epoch time.
  txid: string; // The transaction id.
  walletconflicts: string[]; // Conflicting transaction ids.
  time: number; // The transaction time in UNIX epoch time.
  timereceived: number; // The time received in UNIX epoch time.
  comment?: string; // A comment associated with the transaction, if any.
  'bip125-replaceable': 'yes' | 'no' | 'unknown'; // Whether the transaction could be replaced due to BIP125.
  abandoned?: boolean; // 'true' if the transaction has been abandoned (only for 'send' category).
  label?: string; // A comment for the address/transaction, if any.
  to?: string; // A comment to associated with the transaction.
}
