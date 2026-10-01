import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A rejected registration stops reserving its applicant's identity.
 *
 * `nationalIdNormalized` and `mobileNormalized` carry a unique index, which
 * is what allows one live registration per person. Rejected rows kept their
 * values, so an applicant who was asked to correct their form and send it
 * again was refused as a duplicate of the attempt that had just been turned
 * down -- with no way to get back in.
 *
 * The values stay on `owner` either way, so nothing is lost from the record.
 */
export class ReleaseRejectedIdentities1790990000000 implements MigrationInterface {
  name = 'ReleaseRejectedIdentities1790990000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "enrollments"
         SET "nationalIdNormalized" = NULL, "mobileNormalized" = NULL
       WHERE "status" = 'rejected'
         AND ("nationalIdNormalized" IS NOT NULL OR "mobileNormalized" IS NOT NULL)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restores the reservation from the values kept on `owner`, skipping any
    // that a newer live registration has since taken.
    await queryRunner.query(
      `UPDATE "enrollments" AS e
         SET "nationalIdNormalized" = regexp_replace(COALESCE(e.owner ->> 'nid', ''), '\D', '', 'g'),
             "mobileNormalized"     = regexp_replace(COALESCE(e.owner ->> 'mobile', ''), '\D', '', 'g')
       WHERE e."status" = 'rejected'
         AND e."nationalIdNormalized" IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM "enrollments" o
            WHERE o."ref" <> e."ref"
              AND o."nationalIdNormalized" = regexp_replace(COALESCE(e.owner ->> 'nid', ''), '\D', '', 'g'))`);
  }
}
