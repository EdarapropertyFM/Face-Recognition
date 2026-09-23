import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialStmcSchema1727049600000 implements MigrationInterface {
  name = 'InitialStmcSchema1727049600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "users" (
      "u" varchar PRIMARY KEY, "name" text NOT NULL, "role" varchar NOT NULL,
      "status" varchar NOT NULL DEFAULT 'active', "passwordHash" varchar NULL
    )`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "faces" (
      "id" varchar PRIMARY KEY, "name" text NOT NULL, "type" varchar NOT NULL,
      "role" text NOT NULL, "idno" varchar NOT NULL, "issuer" varchar NOT NULL,
      "enroll" varchar NOT NULL, "img" varchar NULL, "bldg" varchar NULL,
      "unit" varchar NULL, "ban" varchar NULL, "aiPersonId" varchar NULL
    )`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "alerts" (
      "id" varchar PRIMARY KEY, "face" varchar NOT NULL, "cam" varchar NOT NULL,
      "zone" integer NOT NULL, "when" varchar NOT NULL, "conf" integer NOT NULL,
      "status" varchar NOT NULL, "log" jsonb NOT NULL DEFAULT '[]'::jsonb, "incidentId" varchar NULL
    )`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "incidents" (
      "id" varchar PRIMARY KEY, "sef" varchar NOT NULL, "title" text NOT NULL,
      "face" varchar NULL, "zone" integer NOT NULL, "when" varchar NOT NULL,
      "officer" text NOT NULL, "status" varchar NOT NULL, "desc" text NULL,
      "att" jsonb NOT NULL DEFAULT '[]'::jsonb, "alertId" varchar NULL UNIQUE
    )`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "enrollments" (
      "ref" varchar PRIMARY KEY, "schema" varchar NOT NULL, "status" varchar NOT NULL,
      "building" varchar NOT NULL, "unit" varchar NOT NULL, "submittedAt" varchar NOT NULL,
      "owner" jsonb NOT NULL, "family" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "cars" jsonb NOT NULL DEFAULT '[]'::jsonb, "faceId" varchar NULL,
      "validationNote" varchar NULL, "nationalIdNormalized" varchar NULL,
      "mobileNormalized" varchar NULL, "aiSyncStatus" varchar NOT NULL DEFAULT 'not_started',
      "syncAttempts" integer NOT NULL DEFAULT 0, "auditLog" jsonb NOT NULL DEFAULT '[]'::jsonb
    )`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "buildings" (
      "code" varchar PRIMARY KEY, "name" text NOT NULL, "units" integer NOT NULL,
      "unitCodes" jsonb NOT NULL DEFAULT '[]'::jsonb, "cams" integer NOT NULL,
      "enrolled" integer NOT NULL, "strangersToday" integer NOT NULL
    )`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "cameras" (
      "id" varchar PRIMARY KEY, "zone" integer NOT NULL, "status" varchar NOT NULL,
      "det" integer NOT NULL, "last" varchar NOT NULL
    )`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "settings" (
      "id" varchar PRIMARY KEY, "threshold" integer NOT NULL, "retStd" integer NOT NULL,
      "retInc" integer NOT NULL, "retLog" integer NOT NULL, "alertOwners" boolean NOT NULL,
      "alertStrangers" boolean NOT NULL, "alertWatch" boolean NOT NULL
    )`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "detections" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "face" varchar NULL,
      "zone" integer NOT NULL, "conf" integer NOT NULL, "type" varchar NOT NULL,
      "cam" varchar NOT NULL, "when" varchar NOT NULL, "decision" varchar NULL,
      "similarity" double precision NULL, "quality" jsonb NULL
    )`);

    await queryRunner.query('ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "unitCodes" jsonb NOT NULL DEFAULT \'[]\'::jsonb');
    await queryRunner.query('ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "nationalIdNormalized" varchar NULL');
    await queryRunner.query('ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "mobileNormalized" varchar NULL');
    await queryRunner.query('ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "aiSyncStatus" varchar NOT NULL DEFAULT \'not_started\'');
    await queryRunner.query('ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "syncAttempts" integer NOT NULL DEFAULT 0');
    await queryRunner.query('ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "auditLog" jsonb NOT NULL DEFAULT \'[]\'::jsonb');
    await queryRunner.query('CREATE UNIQUE INDEX IF NOT EXISTS "IDX_enrollments_national_id" ON "enrollments" ("nationalIdNormalized") WHERE "nationalIdNormalized" IS NOT NULL');
    await queryRunner.query('CREATE UNIQUE INDEX IF NOT EXISTS "IDX_enrollments_mobile" ON "enrollments" ("mobileNormalized") WHERE "mobileNormalized" IS NOT NULL');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['detections', 'settings', 'cameras', 'buildings', 'enrollments', 'incidents', 'alerts', 'faces', 'users']) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
    }
  }
}
