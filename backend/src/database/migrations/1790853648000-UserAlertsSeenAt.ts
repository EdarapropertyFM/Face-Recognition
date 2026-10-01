import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-user notification read marker.
 *
 * The alerts badge used to count every alert with status 'new', so clicking
 * the bell changed nothing: the count only moved when somebody triaged the
 * alerts themselves. Counting against this timestamp separates "I have looked
 * at my notifications" from "this alert has been dealt with", and keeps the
 * first of those private to each user.
 */
export class UserAlertsSeenAt1790853648000 implements MigrationInterface {
  name = 'UserAlertsSeenAt1790853648000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "alertsSeenAt" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "alertsSeenAt"`);
  }
}
