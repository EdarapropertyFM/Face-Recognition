import dataSource from './data-source';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { Face } from '../faces/entities/face.entity';
import { SecureStorageService } from '../secure-storage/secure-storage.service';

async function run() {
  await dataSource.initialize();
  const enrollments = dataSource.getRepository(Enrollment);
  const faces = dataSource.getRepository(Face);
  const storage = new SecureStorageService();
  let migrated = 0;

  for (const enrollment of await enrollments.find()) {
    const serialized = JSON.stringify(enrollment.owner);
    if (!serialized.includes('data:image/')) continue;
    const storedOwner = await storage.storeEnrollmentOwner(enrollment.ref, enrollment.owner);
    await dataSource.transaction(async (manager) => {
      enrollment.owner = storedOwner;
      await manager.getRepository(Enrollment).save(enrollment);
      if (enrollment.faceId) {
        const face = await manager.getRepository(Face).findOne({ where: { id: enrollment.faceId } });
        const front = (storedOwner.faces as Record<string, unknown> | undefined)?.front;
        if (face && typeof face.img === 'string' && face.img.startsWith('data:image/') && typeof front === 'string') {
          face.img = front;
          await manager.getRepository(Face).save(face);
        }
      }
    });
    migrated += 1;
  }

  const standalonePlaintextFaces = await faces.createQueryBuilder('face')
    .where("face.img LIKE 'data:image/%'")
    .getCount();
  console.log(JSON.stringify({ migratedEnrollments: migrated, standalonePlaintextFaces }));
  await dataSource.destroy();
}

run().catch(async (error) => {
  console.error(error);
  if (dataSource.isInitialized) await dataSource.destroy();
  process.exitCode = 1;
});
