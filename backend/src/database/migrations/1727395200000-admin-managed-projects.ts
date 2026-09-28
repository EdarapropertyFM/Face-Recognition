import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Projects become admin-managed records instead of a by-product of cameras.
 *
 * Deriving them from `cameras.project` meant a project could not be created
 * before its hardware was installed, and could never be renamed or removed.
 * The admin panel now owns them, so a community and its buildings can be set
 * up first and registration can open before a camera is mounted.
 *
 * Existing project names are adopted from the cameras and building settings
 * already referring to them, so nothing has to be re-entered.
 */
export class AdminManagedProjects1727395200000 implements MigrationInterface {
  name = 'AdminManagedProjects1727395200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "projects" (
        "name" character varying NOT NULL,
        "label" text NOT NULL DEFAULT '',
        "active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_projects" PRIMARY KEY ("name")
      )`);

    await queryRunner.query(`
      INSERT INTO "projects" ("name", "label", "active")
      SELECT DISTINCT name, name || ',' || name, true FROM (
        SELECT TRIM("project") AS name FROM "cameras"
        WHERE "project" IS NOT NULL AND TRIM("project") <> ''
        UNION
        SELECT TRIM("project") FROM "building_settings"
        WHERE "project" IS NOT NULL AND TRIM("project") NOT IN ('', 'Unassigned')
      ) AS found
      ON CONFLICT DO NOTHING`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "projects"`);
  }
}
