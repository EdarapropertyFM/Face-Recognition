import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The unit register: every project / building / unit and its owner, supplied
 * by the property manager and shown on the Units page. Independent of STMC
 * registrations, which are matched against it by building and unit.
 */
export class UnitRegistry1727568000000 implements MigrationInterface {
  name = 'UnitRegistry1727568000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "unit_registry" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "project" character varying NOT NULL,
        "building" character varying NOT NULL,
        "unit" character varying NOT NULL,
        "ownerName" character varying,
        "ownerPhone" character varying,
        "floor" character varying,
        "notes" character varying,
        "source" character varying NOT NULL DEFAULT 'demo',
        CONSTRAINT "PK_unit_registry" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_unit_registry_unit"
      ON "unit_registry" ("project", "building", "unit")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "unit_registry"`);
  }
}
