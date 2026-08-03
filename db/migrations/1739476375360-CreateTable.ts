import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateTable1739476375360 implements MigrationInterface {
    name = 'CreateTable1739476375360'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "users" ("userAddress" character varying(200) NOT NULL, "userName" character varying(255) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f379abd8413890ebdd67e9a0a27" PRIMARY KEY ("userAddress"))`);
        await queryRunner.query(`CREATE TABLE "userSummary" ("userAddress" character varying(200) NOT NULL, "userName" character varying(200) NOT NULL, "userBalance" bigint NOT NULL DEFAULT '0', "transactionCount" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b635574745f056bb48dedf4b05d" PRIMARY KEY ("userAddress"))`);
        await queryRunner.query(`CREATE TYPE "public"."unknownUtxo_transactionstatus_enum" AS ENUM('UNCONFIRMED', 'UNSPENT', 'SPENT')`);
        await queryRunner.query(`CREATE TABLE "unknownUtxo" ("txHash" character varying(200) NOT NULL, "vout" integer NOT NULL, "userAddress" character varying(200) NOT NULL, "txValue" bigint NOT NULL, "transactionStatus" "public"."unknownUtxo_transactionstatus_enum" NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_c64b903bdf6d22a6d4bba8bc29b" PRIMARY KEY ("txHash", "vout"))`);
        await queryRunner.query(`CREATE INDEX "IDX_dc70092b6de548ca3a22e61344" ON "unknownUtxo" ("transactionStatus") `);
        await queryRunner.query(`CREATE TYPE "public"."customerUtxo_transactionstatus_enum" AS ENUM('UNCONFIRMED', 'UNSPENT', 'SPENT')`);
        await queryRunner.query(`CREATE TABLE "customerUtxo" ("txHash" character varying(200) NOT NULL, "vout" integer NOT NULL, "txValue" bigint NOT NULL, "transactionStatus" "public"."customerUtxo_transactionstatus_enum" NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userAddress" character varying(200), CONSTRAINT "PK_bbcef66ab5db96cee926ca6c389" PRIMARY KEY ("txHash", "vout"))`);
        await queryRunner.query(`CREATE INDEX "IDX_9ab105c5c9e6628e07cbc0f882" ON "customerUtxo" ("userAddress", "transactionStatus") `);
        await queryRunner.query(`ALTER TABLE "userSummary" ADD CONSTRAINT "FK_b635574745f056bb48dedf4b05d" FOREIGN KEY ("userAddress") REFERENCES "users"("userAddress") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "customerUtxo" ADD CONSTRAINT "FK_0ac5d8361120754962c3572ac25" FOREIGN KEY ("userAddress") REFERENCES "users"("userAddress") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`INSERT INTO public."users"("userAddress", "userName", "createdAt", "updatedAt") VALUES
            ('mvd6qFeVkqH6MNAS2Y2cLifbdaX5XUkbZJ', 'Customer A. Ito', now(), now()),
            ('mmFFG4jqAtw9MoCC88hw5FNfreQWuEHADp', 'Customer B. Reyes', now(), now()),
            ('mzzg8fvHXydKs8j9D2a8t7KpSXpGgAnk4n', 'Customer C. Okafor', now(), now()),
            ('2N1SP7r92ZZJvYKG2oNtzPwYnzw62up7mTo', 'Customer D. Novak', now(), now()),
            ('mutrAf4usv3HKNdpLwVD4ow2oLArL6Rez8', 'Customer E. Lindqvist', now(), now()),
            ('miTHhiX3iFhVnAEecLjybxvV5g8mKYTtnM', 'Customer F. Alvarez', now(), now()),
            ('mvcyJMiAcSXKAEsQxbW9TYZ369rsMG6rVV', 'Customer G. Petrov', now(), now());`); //added manually to preload DB  
        await queryRunner.query(`CREATE OR REPLACE FUNCTION update_user_summary_on_customerUtxo_insert()
                                RETURNS TRIGGER AS $$
                                BEGIN
                                    -- Insert if the user doesn't exist in userSummary, otherwise update
                                    INSERT INTO "userSummary" ("userAddress", "userName", "userBalance", "transactionCount", "createdAt", "updatedAt")
                                    VALUES (
                                        NEW."userAddress",
                                        (SELECT "userName" FROM "users" WHERE "userAddress" = NEW."userAddress"),
                                        (SELECT COALESCE(SUM("txValue")::bigint, 0)
                                        FROM "customerUtxo"
                                        WHERE "userAddress" = NEW."userAddress"
                                        AND "transactionStatus" = 'UNSPENT'),
                                        (SELECT COUNT(*)
                                        FROM "customerUtxo"
                                        WHERE "userAddress" = NEW."userAddress"),
                                        NOW(),
                                        NOW()
                                    )
                                    ON CONFLICT ("userAddress")  
                                    DO UPDATE SET 
                                        "userName" = (SELECT "userName" FROM "users" WHERE "userAddress" = EXCLUDED."userAddress"),
                                        "userBalance" = EXCLUDED."userBalance",
                                        "transactionCount" = EXCLUDED."transactionCount",
                                        "updatedAt" = NOW();
                                    RETURN NEW;
                                END;
                                $$ LANGUAGE plpgsql;`);
        await queryRunner.query(`CREATE TRIGGER trigger_update_user_summary
                                AFTER INSERT ON "customerUtxo"
                                FOR EACH ROW
                                WHEN (NEW."userAddress" IS NOT NULL)
                                EXECUTE FUNCTION update_user_summary_on_customerUtxo_insert();`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TRIGGER IF EXISTS trigger_update_user_summary ON "utxo" CASCADE;`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS update_user_summary_on_utxo_insert() CASCADE;`);
        await queryRunner.query(`ALTER TABLE "customerUtxo" DROP CONSTRAINT "FK_0ac5d8361120754962c3572ac25"`);
        await queryRunner.query(`ALTER TABLE "userSummary" DROP CONSTRAINT "FK_b635574745f056bb48dedf4b05d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9ab105c5c9e6628e07cbc0f882"`);
        await queryRunner.query(`DROP TABLE "customerUtxo"`);
        await queryRunner.query(`DROP TYPE "public"."customerUtxo_transactionstatus_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dc70092b6de548ca3a22e61344"`);
        await queryRunner.query(`DROP TABLE "unknownUtxo"`);
        await queryRunner.query(`DROP TYPE "public"."unknownUtxo_transactionstatus_enum"`);
        await queryRunner.query(`DROP TABLE "userSummary"`);
        await queryRunner.query(`DROP TABLE "users"`);
    }

}
