import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Registrations can come from a unit's owner or from a tenant renting it.
 * Tenants attach their rental agreement (stored encrypted, like the National
 * ID card, under owner.rentalAgreement). Every existing registration was an
 * owner's, which is the column default.
 */
export class EnrollmentResidentType1727481600000 implements MigrationInterface {
  name = 'EnrollmentResidentType1727481600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "residentType" character varying NOT NULL DEFAULT 'owner'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "enrollments" DROP COLUMN IF EXISTS "residentType"`);
  }
}
