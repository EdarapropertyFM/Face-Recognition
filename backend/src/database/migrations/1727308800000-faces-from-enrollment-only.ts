import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The Face Database lists only people who registered through the enrolment
 * site.
 *
 * Until now `FacesService.syncFromGallery()` created a face record for every
 * person in the AI gallery, so anyone added by a script or the AI webcam page
 * appeared alongside real registrations, with no consent record, no unit and
 * no paperwork behind them. That sync is gone; faces are now created only by
 * an enrolment approval, which stamps `enrollmentRef`.
 *
 * Existing rows are cleared at the operator's request. The AI gallery is left
 * untouched, so those people remain recognisable to the cameras until they
 * are removed there as well.
 */
export class FacesFromEnrollmentOnly1727308800000 implements MigrationInterface {
  name = 'FacesFromEnrollmentOnly1727308800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "faces" ADD COLUMN IF NOT EXISTS "enrollmentRef" character varying`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_faces_enrollmentRef" ON "faces" ("enrollmentRef")`);

    // Wipe the current contents of the Face Database. Enrolments keep their
    // own records; their dangling faceId is cleared so nothing points at a
    // row that no longer exists.
    await queryRunner.query(`UPDATE "enrollments" SET "faceId" = NULL WHERE "faceId" IS NOT NULL`);
    await queryRunner.query(`DELETE FROM "faces"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The deleted rows cannot be restored; only the column is reversible.
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_faces_enrollmentRef"`);
    await queryRunner.query(`ALTER TABLE "faces" DROP COLUMN IF EXISTS "enrollmentRef"`);
  }
}
