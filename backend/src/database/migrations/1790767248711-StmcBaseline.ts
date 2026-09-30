import { MigrationInterface, QueryRunner } from "typeorm";

export class StmcBaseline1790767248711 implements MigrationInterface {
    name = 'StmcBaseline1790767248711'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // gen_random_uuid() is built in from PostgreSQL 13; the extension is
        // only needed if the company server runs something older.
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
        await queryRunner.query(`CREATE TABLE "alerts" ("id" character varying NOT NULL, "face" character varying NOT NULL, "cam" character varying NOT NULL, "zone" integer NOT NULL, "when" character varying NOT NULL, "conf" integer NOT NULL, "status" character varying NOT NULL, "log" jsonb NOT NULL DEFAULT '[]', "incidentId" character varying, CONSTRAINT "PK_60f895662df096bfcdfab7f4b96" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "cameras" ("id" character varying NOT NULL, "zone" integer NOT NULL, "status" character varying NOT NULL, "det" integer NOT NULL, "last" character varying NOT NULL, "displayName" character varying NOT NULL DEFAULT '', "project" character varying, "buildingCode" character varying, "location" character varying, "rtspUrlEncrypted" text, "rtspConfigured" boolean NOT NULL DEFAULT false, "host" character varying, "port" integer, "username" character varying, "brand" character varying, "channel" integer, "stream" character varying, "playbackId" character varying NOT NULL DEFAULT gen_random_uuid(), "codec" character varying NOT NULL DEFAULT 'unknown', "enabled" boolean NOT NULL DEFAULT true, "streamStatus" character varying NOT NULL DEFAULT 'unconfigured', "rotation" integer NOT NULL DEFAULT '0', "lastHeartbeat" character varying, "lastError" text, CONSTRAINT "UQ_c2ba0bd85b241ff5c5d62265fe4" UNIQUE ("playbackId"), CONSTRAINT "PK_88b40b9817f9f422121f861e1e8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "detections" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "face" character varying, "zone" integer NOT NULL, "conf" integer NOT NULL, "type" character varying NOT NULL, "cam" character varying NOT NULL, "when" character varying NOT NULL, "decision" character varying, "similarity" double precision, "quality" jsonb, "snapshot" character varying, "evidenceStill" character varying, CONSTRAINT "PK_4da30bad53c898b6d767852594e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "enrollments" ("ref" character varying NOT NULL, "schema" character varying NOT NULL, "status" character varying NOT NULL, "residentType" character varying NOT NULL DEFAULT 'owner', "building" character varying NOT NULL, "unit" character varying NOT NULL, "residences" jsonb NOT NULL DEFAULT '[]', "submittedAt" character varying NOT NULL, "owner" jsonb NOT NULL, "family" jsonb NOT NULL DEFAULT '[]', "cars" jsonb NOT NULL DEFAULT '[]', "faceId" character varying, "aiPersonId" character varying, "validationNote" character varying, "nationalIdNormalized" character varying, "mobileNormalized" character varying, "aiSyncStatus" character varying NOT NULL DEFAULT 'not_started', "syncAttempts" integer NOT NULL DEFAULT '0', "auditLog" jsonb NOT NULL DEFAULT '[]', CONSTRAINT "PK_778a7a85e326c9bb5e5d450b8ca" PRIMARY KEY ("ref"))`);
        await queryRunner.query(`CREATE INDEX "IDX_91746907cf4b91c5d94f999809" ON "enrollments"  ("aiPersonId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_3948f032c3a2e0761661353cbd" ON "enrollments"  ("nationalIdNormalized") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_561c873af906bfb231b6bd9c4f" ON "enrollments"  ("mobileNormalized") `);
        await queryRunner.query(`CREATE TABLE "faces" ("id" character varying NOT NULL, "name" text NOT NULL, "type" character varying NOT NULL, "role" text NOT NULL, "idno" character varying NOT NULL, "issuer" character varying NOT NULL, "enroll" character varying NOT NULL, "img" character varying, "bldg" character varying, "unit" character varying, "ban" character varying, "aiPersonId" character varying, "enrollmentRef" character varying, CONSTRAINT "PK_d7ce2dfda1e63bfba799ffa6737" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_64071e8c5e5597b7034aef3ac9" ON "faces"  ("enrollmentRef") `);
        await queryRunner.query(`CREATE TABLE "incidents" ("id" character varying NOT NULL, "sef" character varying NOT NULL, "title" text NOT NULL, "face" character varying, "zone" integer NOT NULL, "when" character varying NOT NULL, "officer" text NOT NULL, "status" character varying NOT NULL, "desc" text, "att" jsonb NOT NULL DEFAULT '[]', "alertId" character varying, CONSTRAINT "UQ_5a84601fabd02363a4ee7ab1f2e" UNIQUE ("alertId"), CONSTRAINT "PK_ccb34c01719889017e2246469f9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "settings" ("id" character varying NOT NULL, "threshold" integer NOT NULL DEFAULT '40', "retStd" integer NOT NULL DEFAULT '90', "retLog" integer NOT NULL DEFAULT '365', "alertOwners" boolean NOT NULL DEFAULT false, "alertStrangers" boolean NOT NULL DEFAULT true, "purgeEnabled" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_0669fe20e252eb692bf4d344975" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "building_settings" ("project" character varying NOT NULL, "code" character varying NOT NULL, "name" text NOT NULL DEFAULT '', "totalUnits" integer NOT NULL DEFAULT '0', "unitCodes" jsonb NOT NULL DEFAULT '[]', "unitOwners" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "PK_f3e221b57b4a64de35b492a6509" PRIMARY KEY ("project", "code"))`);
        await queryRunner.query(`CREATE TABLE "unit_registry" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project" character varying NOT NULL, "building" character varying NOT NULL, "unit" character varying NOT NULL, "ownerName" character varying, "ownerPhone" character varying, "floor" character varying, "notes" character varying, "source" character varying NOT NULL DEFAULT 'demo', CONSTRAINT "PK_b16c8c05b6664837546bb0fcfb6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_bede0ef6523a56745ddcda0518" ON "unit_registry"  ("project", "building", "unit") `);
        await queryRunner.query(`CREATE TABLE "projects" ("name" character varying NOT NULL, "label" text NOT NULL DEFAULT '', "active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_2187088ab5ef2a918473cb99007" PRIMARY KEY ("name"))`);
        await queryRunner.query(`CREATE TABLE "users" ("u" character varying NOT NULL, "name" text NOT NULL, "role" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'active', "passwordHash" character varying, CONSTRAINT "PK_a2a4eb83746bd6d82f6629e38e6" PRIMARY KEY ("u"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TABLE "projects"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bede0ef6523a56745ddcda0518"`);
        await queryRunner.query(`DROP TABLE "unit_registry"`);
        await queryRunner.query(`DROP TABLE "building_settings"`);
        await queryRunner.query(`DROP TABLE "settings"`);
        await queryRunner.query(`DROP TABLE "incidents"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_64071e8c5e5597b7034aef3ac9"`);
        await queryRunner.query(`DROP TABLE "faces"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_561c873af906bfb231b6bd9c4f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3948f032c3a2e0761661353cbd"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_91746907cf4b91c5d94f999809"`);
        await queryRunner.query(`DROP TABLE "enrollments"`);
        await queryRunner.query(`DROP TABLE "detections"`);
        await queryRunner.query(`DROP TABLE "cameras"`);
        await queryRunner.query(`DROP TABLE "alerts"`);
    }

}
