import { MigrationInterface, QueryRunner } from 'typeorm';

export class CameraPlaybackDefault1727136100000 implements MigrationInterface {
  name = 'CameraPlaybackDefault1727136100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "cameras" ALTER COLUMN "playbackId" SET DEFAULT gen_random_uuid()::text');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "cameras" ALTER COLUMN "playbackId" DROP DEFAULT');
  }
}
