import { MigrationInterface, QueryRunner } from 'typeorm';

export class CameraStreamFoundation1727136000000 implements MigrationInterface {
  name = 'CameraStreamFoundation1727136000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await queryRunner.query('ALTER TABLE "cameras" ADD COLUMN IF NOT EXISTS "displayName" varchar NOT NULL DEFAULT \'\'');
    await queryRunner.query('ALTER TABLE "cameras" ADD COLUMN IF NOT EXISTS "buildingCode" varchar NULL');
    await queryRunner.query('ALTER TABLE "cameras" ADD COLUMN IF NOT EXISTS "location" varchar NULL');
    await queryRunner.query('ALTER TABLE "cameras" ADD COLUMN IF NOT EXISTS "rtspUrlEncrypted" text NULL');
    await queryRunner.query('ALTER TABLE "cameras" ADD COLUMN IF NOT EXISTS "rtspConfigured" boolean NOT NULL DEFAULT false');
    await queryRunner.query('ALTER TABLE "cameras" ADD COLUMN IF NOT EXISTS "playbackId" varchar NULL');
    await queryRunner.query('UPDATE "cameras" SET "playbackId" = gen_random_uuid()::text WHERE "playbackId" IS NULL');
    await queryRunner.query('ALTER TABLE "cameras" ALTER COLUMN "playbackId" SET NOT NULL');
    await queryRunner.query('ALTER TABLE "cameras" ALTER COLUMN "playbackId" SET DEFAULT gen_random_uuid()::text');
    await queryRunner.query('ALTER TABLE "cameras" ADD COLUMN IF NOT EXISTS "codec" varchar NOT NULL DEFAULT \'unknown\'');
    await queryRunner.query('ALTER TABLE "cameras" ADD COLUMN IF NOT EXISTS "enabled" boolean NOT NULL DEFAULT true');
    await queryRunner.query('ALTER TABLE "cameras" ADD COLUMN IF NOT EXISTS "streamStatus" varchar NOT NULL DEFAULT \'unconfigured\'');
    await queryRunner.query('ALTER TABLE "cameras" ADD COLUMN IF NOT EXISTS "lastHeartbeat" varchar NULL');
    await queryRunner.query('ALTER TABLE "cameras" ADD COLUMN IF NOT EXISTS "lastError" text NULL');
    await queryRunner.query('CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cameras_playback_id" ON "cameras" ("playbackId")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cameras_playback_id"');
    for (const column of ['lastError', 'lastHeartbeat', 'streamStatus', 'enabled', 'codec', 'playbackId', 'rtspConfigured', 'rtspUrlEncrypted', 'location', 'buildingCode', 'displayName']) {
      await queryRunner.query(`ALTER TABLE "cameras" DROP COLUMN IF EXISTS "${column}"`);
    }
  }
}
