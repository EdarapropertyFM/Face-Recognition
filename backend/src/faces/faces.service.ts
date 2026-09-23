import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Face } from './entities/face.entity';
import { CreateFaceDto } from './dto/create-face.dto';
import { UpdateFaceDto } from './dto/update-face.dto';
import { SecureStorageService } from '../secure-storage/secure-storage.service';

@Injectable()
export class FacesService {
  constructor(
    @InjectRepository(Face) private faceRepo: Repository<Face>,
    private readonly storage: SecureStorageService,
  ) {}

  async create(createFaceDto: CreateFaceDto) {
    const face = this.faceRepo.create(createFaceDto);
    // Auto-generate ID if not provided
    if (!face.id) face.id = `F-${Math.floor(1000 + Math.random() * 9000)}`;
    if (!face.enroll) face.enroll = new Date().toISOString().split('T')[0];
    
    return await this.faceRepo.save(face);
  }

  async findAll(type?: string) {
    const qb = this.faceRepo.createQueryBuilder('face');
    if (type) {
      qb.andWhere('face.type = :type', { type });
    }
    const faces = await qb.getMany();
    return Promise.all(faces.map((face) => this.hydrate(face)));
  }

  async findOne(id: string) {
    const face = await this.findEntity(id);
    return this.hydrate(face);
  }

  private async findEntity(id: string) {
    const face = await this.faceRepo.findOne({ where: { id } });
    if (!face) throw new NotFoundException('Face not found');
    return face;
  }

  async update(id: string, updateFaceDto: UpdateFaceDto) {
    const face = await this.findEntity(id);
    Object.assign(face, updateFaceDto);
    return await this.faceRepo.save(face);
  }

  async remove(id: string) {
    const face = await this.findEntity(id);
    return await this.faceRepo.remove(face);
  }

  private async hydrate(face: Face) {
    const img = await this.storage.resolveImage(face.img).catch(() => face.img);
    return { ...face, img };
  }
}
