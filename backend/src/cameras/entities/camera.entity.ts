import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('cameras')
export class Camera {
  @PrimaryColumn()
  id: string;

  @Column()
  zone: number;

  @Column()
  status: string; // online, offline

  @Column()
  det: number;

  @Column()
  last: string;

  @Column({ default: '' })
  displayName: string;

  // Project and building are the source of truth for the Units module: a
  // project/building exists there because a camera was installed for it.
  @Column({ type: 'varchar', nullable: true })
  project: string | null;

  @Column({ type: 'varchar', nullable: true })
  buildingCode: string | null;

  @Column({ type: 'varchar', nullable: true })
  location: string | null;

  @Column({ type: 'text', nullable: true, select: false })
  rtspUrlEncrypted: string | null;

  @Column({ default: false })
  rtspConfigured: boolean;

  // Non-secret half of the connection details, kept so the edit form can be
  // reopened without ever sending the password back to the browser. The
  // password lives only inside rtspUrlEncrypted.
  @Column({ type: 'varchar', nullable: true })
  host: string | null;

  @Column({ type: 'int', nullable: true })
  port: number | null;

  @Column({ type: 'varchar', nullable: true })
  username: string | null;

  @Column({ type: 'varchar', nullable: true })
  brand: string | null;

  @Column({ type: 'int', nullable: true })
  channel: number | null;

  @Column({ type: 'varchar', nullable: true })
  stream: string | null;

  @Column({ unique: true, default: () => 'gen_random_uuid()' })
  playbackId: string;

  @Column({ default: 'unknown' })
  codec: string;

  @Column({ default: true })
  enabled: boolean;

  @Column({ default: 'unconfigured' })
  streamStatus: string;

  /**
   * Quarter turns needed to show this camera the right way up, for one that
   * is physically mounted on its side. Applied by the AI before recognition
   * runs, not in the browser: a face detector is far weaker on faces lying
   * on their side, and the overlay must be drawn onto an upright picture.
   */
  @Column({ type: 'int', default: 0 })
  rotation: number;

  @Column({ type: 'varchar', nullable: true })
  lastHeartbeat: string | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;
}
