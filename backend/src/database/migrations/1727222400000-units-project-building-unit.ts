import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Buildings becomes Units, structured Project / Building / Unit.
 *
 * The list of projects and buildings is no longer stored: it is derived from
 * the cameras that have been installed, so `cameras.project` is added beside
 * the existing `buildingCode`. Units come from enrolments, and a resident may
 * hold several — possibly in different projects — so `enrollments.residences`
 * is added; the existing building/unit columns stay as the primary residence.
 *
 * The old `buildings` table held invented occupancy counts (units, enrolled,
 * cams, strangersToday) that are now all counted live, so it is replaced by
 * `building_settings`, which keeps only what no camera can report: the display
 * name, the real unit count behind the coverage bar, and the unit codes a
 * resident may pick from.
 */
export class UnitsProjectBuildingUnit1727222400000 implements MigrationInterface {
  name = 'UnitsProjectBuildingUnit1727222400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cameras" ADD COLUMN IF NOT EXISTS "project" character varying`);
    await queryRunner.query(`ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "residences" jsonb NOT NULL DEFAULT '[]'`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "building_settings" (
        "project" character varying NOT NULL,
        "code" character varying NOT NULL,
        "name" text NOT NULL DEFAULT '',
        "totalUnits" integer NOT NULL DEFAULT 0,
        "unitCodes" jsonb NOT NULL DEFAULT '[]',
        CONSTRAINT "PK_building_settings" PRIMARY KEY ("project", "code")
      )`);

    // Carry over only the display name and unit count; the rest was invented.
    // The project is unknown for these rows, so they are parked under
    // 'Unassigned' and rejoin a project as soon as a camera names one.
    const hasOld: Array<{ exists: boolean }> = await queryRunner.query(
      `SELECT to_regclass('public.buildings') IS NOT NULL AS exists`);
    if (hasOld[0]?.exists) {
      await queryRunner.query(`
        INSERT INTO "building_settings" ("project", "code", "name", "totalUnits", "unitCodes")
        SELECT 'Unassigned', "code", "name", "units", COALESCE("unitCodes", '[]'::jsonb)
        FROM "buildings"
        WHERE "code" NOT IN ('WTR-B1', 'WTR-B2', 'WTR-B3')
        ON CONFLICT DO NOTHING`);
      await queryRunner.query(`DROP TABLE "buildings"`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "buildings" (
        "code" character varying NOT NULL,
        "name" text NOT NULL,
        "units" integer NOT NULL,
        "unitCodes" jsonb NOT NULL DEFAULT '[]',
        "cams" integer NOT NULL DEFAULT 0,
        "enrolled" integer NOT NULL DEFAULT 0,
        "strangersToday" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_buildings" PRIMARY KEY ("code")
      )`);
    await queryRunner.query(`
      INSERT INTO "buildings" ("code", "name", "units", "unitCodes")
      SELECT "code", "name", "totalUnits", "unitCodes" FROM "building_settings"
      ON CONFLICT DO NOTHING`);
    await queryRunner.query(`DROP TABLE IF EXISTS "building_settings"`);
    await queryRunner.query(`ALTER TABLE "enrollments" DROP COLUMN IF EXISTS "residences"`);
    await queryRunner.query(`ALTER TABLE "cameras" DROP COLUMN IF EXISTS "project"`);
  }
}
