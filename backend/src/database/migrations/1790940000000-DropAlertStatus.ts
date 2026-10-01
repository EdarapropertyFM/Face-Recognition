import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Alerts stop being cases and become notifications.
 *
 * The ack -> actioned -> resolved cycle assumed every alert was work to be
 * triaged. In this community an alert means "a person was seen entering",
 * which is information, not a task: there were 151 sitting in `new` because
 * there was never anything to do with them. Whether an operator has *looked*
 * is now tracked per user on `users.alertsSeenAt`, which is a different and
 * more honest question.
 */
export class DropAlertStatus1790940000000 implements MigrationInterface {
  name = 'DropAlertStatus1790940000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "alerts" DROP COLUMN IF EXISTS "status"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restores the column; every existing alert comes back as un-triaged,
    // which is what they all were.
    await queryRunner.query(`ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "status" character varying NOT NULL DEFAULT 'new'`);
  }
}
