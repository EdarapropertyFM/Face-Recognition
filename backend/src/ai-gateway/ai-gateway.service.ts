import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Face } from '../faces/entities/face.entity';

@Injectable()
export class AiGatewayService {
  private readonly baseUrl = process.env.AI_BASE_URL || 'http://127.0.0.1:8000';
  constructor(@InjectRepository(Face) private readonly faces: Repository<Face>) {}

  private async request(path: string, init?: RequestInit, timeoutMs = 8000) {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
      const text = await response.text();
      return text ? JSON.parse(text) : {};
    } catch (error) { throw new BadGatewayException(`AI service unavailable: ${error instanceof Error ? error.message : 'unknown error'}`); }
  }

  health() { return this.request('/health'); }
  persons() { return this.request('/persons'); }
  recognize(image_b64: string) {
    return this.request('/recognize/base64', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_b64 }),
    });
  }

  probeCamera(source: string) {
    return this.request('/camera/probe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source }),
    }, 15000) as Promise<{ ok: boolean; width: number; height: number; fps: number; seconds: number; error?: string }>;
  }

  streamCamera(source: string, signal: AbortSignal) {
    return fetch(`${this.baseUrl}/stream?source=${encodeURIComponent(source)}`, {
      signal, headers: { Accept: 'multipart/x-mixed-replace' },
    });
  }

  async syncFace(faceId: string) {
    const face = await this.faces.findOne({ where: { id: faceId } });
    if (!face) throw new NotFoundException('Face not found');
    if (face.aiPersonId) return { faceId, aiPersonId: face.aiPersonId, created: false };
    const result = await this.request('/persons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: face.name?.[0] ?? face.id, role: face.type }) }) as { person_id: string };
    face.aiPersonId = result.person_id;
    await this.faces.save(face);
    return { faceId, aiPersonId: face.aiPersonId, created: true };
  }

  async provisionPerson(name: string, role: string, images: string[]) {
    if (images.length < 5) throw new BadGatewayException('AI enrollment requires five face photos');
    let personId: string | null = null;
    try {
      const person = await this.request('/persons', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, role }),
      }) as { person_id: string };
      personId = person.person_id;
      const form = new FormData();
      images.forEach((image, index) => {
        const [header, encoded] = image.split(',');
        const contentType = header.match(/^data:(image\/[^;]+);base64$/)?.[1] ?? 'image/jpeg';
        form.append('files', new Blob([Buffer.from(encoded, 'base64')], { type: contentType }), `enrollment-${index + 1}.jpg`);
      });
      const enrollment = await this.request(`/persons/${personId}/enroll`, { method: 'POST', body: form }, 60000);
      return { personId, enrollment };
    } catch (error) {
      if (personId) await this.deletePerson(personId).catch(() => undefined);
      throw error;
    }
  }

  async deletePerson(personId: string) {
    try {
      const response = await fetch(`${this.baseUrl}/persons/${personId}`, {
        method: 'DELETE', signal: AbortSignal.timeout(15000),
      });
      if (!response.ok && response.status !== 404) throw new Error(`${response.status} ${await response.text()}`);
      return { personId, deleted: response.ok, alreadyMissing: response.status === 404 };
    } catch (error) {
      throw new BadGatewayException(`AI service unavailable: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
}
