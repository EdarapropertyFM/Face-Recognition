/**
 * Start one AI relay (ai_relay/relay.py) per enabled camera, so every face a
 * camera sees becomes a detection -> alert in STMC, live.
 *
 *   cd backend
 *   npx ts-node scripts/start-relays.ts            # all enabled cameras
 *   npx ts-node scripts/start-relays.ts CH1-CH1    # only these camera ids
 *
 * The RTSP address (with the camera password) is decrypted here and handed
 * straight to the relay process; it is never printed. Ctrl+C stops them all.
 */
import { spawn, ChildProcess } from 'child_process';
import { readFileSync } from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { SecretCipherService } from '../src/security/secret-cipher.service';

const ROOT = path.resolve(__dirname, '..', '..');

function loadEnv(file: string) {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

async function main() {
  loadEnv(path.join(__dirname, '..', '.env'));
  if (!process.env.STMC_AI_EVENT_TOKEN) throw new Error('STMC_AI_EVENT_TOKEN is missing from backend/.env');

  const db = new Client({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  await db.connect();
  const only = process.argv.slice(2);
  const { rows } = await db.query<{ id: string; zone: number; rtspUrlEncrypted: string }>(
    `SELECT id, zone, "rtspUrlEncrypted" FROM cameras WHERE enabled AND "rtspUrlEncrypted" IS NOT NULL ORDER BY id`);
  await db.end();

  const cameras = rows.filter((c) => !only.length || only.includes(c.id));
  if (!cameras.length) throw new Error('No enabled camera with an RTSP address' + (only.length ? ` among ${only.join(', ')}` : ''));

  const cipher = new SecretCipherService();
  const python = path.join(ROOT, '.venv', 'Scripts', 'python.exe');
  const port = process.env.PORT || '3000';
  const children: ChildProcess[] = [];

  for (const cam of cameras) {
    const source = cipher.decrypt(cam.rtspUrlEncrypted);
    const child = spawn(python, ['-u', path.join('ai_relay', 'relay.py'),
      '--source', source, '--camera', cam.id, '--zone', String(cam.zone),
      '--stmc-url', `http://127.0.0.1:${port}/api/detections/ai-event`], { cwd: ROOT, env: process.env });
    const tag = `[${cam.id}]`;
    const log = (chunk: Buffer) => chunk.toString().split(/\r?\n/).filter(Boolean)
      // ffmpeg can echo the URL; mask any credentials before printing.
      .forEach((line) => console.log(tag, line.replace(/:\/\/([^:/@]+):[^@]*@/g, '://$1:*****@')));
    child.stdout.on('data', log);
    child.stderr.on('data', log);
    child.on('exit', (code) => console.log(tag, `relay exited (${code})`));
    children.push(child);
    console.log(tag, 'relay started');
  }

  const stop = () => { children.forEach((c) => c.kill()); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((error) => { console.error(error.message); process.exit(1); });
