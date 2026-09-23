import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Alert } from '../alerts/entities/alert.entity';
import { Building } from '../buildings/entities/building.entity';
import { Camera } from '../cameras/entities/camera.entity';
import { Detection } from '../detections/entities/detection.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { Face } from '../faces/entities/face.entity';
import { Incident } from '../incidents/entities/incident.entity';
import { Setting } from '../settings/entities/setting.entity';
import { User } from '../users/entities/user.entity';
import { InitialStmcSchema1727049600000 } from './migrations/1727049600000-initial-stmc-schema';
import { CameraStreamFoundation1727136000000 } from './migrations/1727136000000-camera-stream-foundation';
import { CameraPlaybackDefault1727136100000 } from './migrations/1727136100000-camera-playback-default';

try { process.loadEnvFile('.env'); } catch { /* deployment variables may come from the host */ }

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'stmc',
  synchronize: false,
  entities: [User, Face, Alert, Incident, Enrollment, Building, Camera, Setting, Detection],
  migrations: [InitialStmcSchema1727049600000, CameraStreamFoundation1727136000000, CameraPlaybackDefault1727136100000],
});
