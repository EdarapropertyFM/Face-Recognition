import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Alert } from '../alerts/entities/alert.entity';
import { BuildingSetting } from '../units/entities/building-setting.entity';
import { Project } from '../units/entities/project.entity';
import { Camera } from '../cameras/entities/camera.entity';
import { Detection } from '../detections/entities/detection.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { Face } from '../faces/entities/face.entity';
import { Incident } from '../incidents/entities/incident.entity';
import { Setting } from '../settings/entities/setting.entity';
import { User } from '../users/entities/user.entity';
import { UnitRecord } from '../units/entities/unit-record.entity';
import { StmcBaseline1790767248711 } from './migrations/1790767248711-StmcBaseline';

try { process.loadEnvFile('.env'); } catch { /* deployment variables may come from the host */ }

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'stmc',
  synchronize: false,
  // Every entity, explicitly. A glob would break once the code is compiled
  // to dist/, and a missing one silently drops its table from the schema --
  // which is how `unit_registry` came to have no migration.
  entities: [User, Face, Alert, Incident, Enrollment, BuildingSetting, Project, Camera, Setting, Detection, UnitRecord],
  // The baseline creates the whole schema. See migrations/README.md for why
  // the older 1727* files are not listed.
  migrations: [StmcBaseline1790767248711],
});
