import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerUtxoDeleteTrigger1785797569983
  implements MigrationInterface
{
  name = 'AddCustomerUtxoDeleteTrigger1785797569983';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE OR REPLACE FUNCTION update_user_summary_on_customerUtxo_delete()
                                RETURNS TRIGGER AS $$
                                BEGIN
                                    -- Reorged-out deposits are deleted from "customerUtxo"; keep
                                    -- "userSummary" in sync by recomputing from scratch, mirroring
                                    -- the AFTER INSERT trigger's logic.
                                    UPDATE "userSummary"
                                    SET
                                        "userBalance" = (SELECT COALESCE(SUM("txValue")::bigint, 0)
                                            FROM "customerUtxo"
                                            WHERE "userAddress" = OLD."userAddress"
                                            AND "transactionStatus" = 'UNSPENT'),
                                        "transactionCount" = (SELECT COUNT(*)
                                            FROM "customerUtxo"
                                            WHERE "userAddress" = OLD."userAddress"),
                                        "updatedAt" = NOW()
                                    WHERE "userAddress" = OLD."userAddress";
                                    RETURN OLD;
                                END;
                                $$ LANGUAGE plpgsql;`);
    await queryRunner.query(`CREATE TRIGGER trigger_update_user_summary_on_delete
                                AFTER DELETE ON "customerUtxo"
                                FOR EACH ROW
                                WHEN (OLD."userAddress" IS NOT NULL)
                                EXECUTE FUNCTION update_user_summary_on_customerUtxo_delete();`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trigger_update_user_summary_on_delete ON "customerUtxo" CASCADE;`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS update_user_summary_on_customerUtxo_delete() CASCADE;`,
    );
  }
}
