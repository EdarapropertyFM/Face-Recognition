import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Face } from '../faces/entities/face.entity';
import { AiEnrollment, enrollmentFailure } from './enrollment-result';

export type { AiEnrollment } from './enrollment-result';

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
      const enrollment = await this.request(`/persons/${personId}/enroll`, { method: 'POST', body: form }, 60000) as AiEnrollment;

      // The AI answers 200 even when it rejected every photo, so an unchecked
      // response leaves an AI person with zero templates: the resident looks
      // approved and synced but can never be recognized. Verify the templates.
      this.assertEnrolled(enrollment, images.length);
      return { personId, enrollment };
    } catch (error) {
      if (personId) await this.deletePerson(personId).catch(() => undefined);
      throw error;
    }
  }

  /** Reject an enrollment that produced too few templates, naming the reasons. */
  private assertEnrolled(enrollment: AiEnrollment, sent: number) {
    const failure = enrollmentFailure(enrollment, sent);
    if (failure) throw new BadGatewayException(failure);
  }

  /**
   * The gallery match for a single frame, or null if nobody is confirmed.
   * Used to stop a repeat registrant at capture time instead of letting them
   * fill in four more steps first.
   */
  async identify(image_b64: string) {
    const result = await this.recognize(image_b64) as {
      faces?: Array<{ decision?: string; person_id?: string; name?: string; similarity?: number }>;
    };
    const hit = result.faces?.find((face) => face.decision === 'confirmed');
    return hit ? { personId: hit.person_id ?? null, name: hit.name ?? null, similarity: hit.similarity ?? 0 } : null;
  }

  /**
   * Rename / re-role an existing gallery person, leaving the templates alone.
   * Approval uses it to turn the anonymous 'provisional' capture into the
   * named resident, so the gallery does not keep showing them as pending.
   */
  updatePerson(personId: string, name: string, role: string) {
    return this.request(`/persons/${personId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, role }),
    });
  }

  /** Every person in the AI gallery, with the role they were created under. */
  async listPersons() {
    const body = await this.persons() as {
      persons?: Array<{ person_id: string; name: string; role: string; created_at: string; template_count: number }>;
    };
    return body.persons ?? [];
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
