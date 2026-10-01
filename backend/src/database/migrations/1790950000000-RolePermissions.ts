import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Role permissions become data instead of a constant compiled into the
 * browser bundle, so the matrix on the Admin screen can be edited without
 * a deploy. The rows themselves are seeded by RolesService on boot.
 */
export class RolePermissions1790950000000 implements MigrationInterface {
  name = 'RolePermissions1790950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "role_permissions" (
        "role" character varying NOT NULL,
        "view" jsonb NOT NULL DEFAULT '[]',
        "edit" jsonb NOT NULL DEFAULT '[]',
        "builtIn" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_role_permissions" PRIMARY KEY ("role")
      )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "role_permissions"`);
  }
}
