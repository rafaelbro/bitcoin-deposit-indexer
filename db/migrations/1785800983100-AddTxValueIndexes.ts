import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTxValueIndexes1785800983100 implements MigrationInterface {
  name = 'AddTxValueIndexes1785800983100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_customerUtxo_txValue" ON "customerUtxo" ("txValue")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_unknownUtxo_txValue" ON "unknownUtxo" ("txValue")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_unknownUtxo_txValue"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_customerUtxo_txValue"`);
  }
}
