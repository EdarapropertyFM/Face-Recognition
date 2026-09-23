import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateBuildingDto } from './dto/create-building.dto';
import { UpdateBuildingDto } from './dto/update-building.dto';
import { Building } from './entities/building.entity';

@Injectable()
export class BuildingsService {
  constructor(@InjectRepository(Building) private readonly buildings: Repository<Building>) {}

  async create(createBuildingDto: CreateBuildingDto) {
    if (await this.buildings.exists({ where: { code: createBuildingDto.code } })) {
      throw new ConflictException('A building with this code already exists');
    }
    return this.buildings.save(this.buildings.create({
      cams: 0, enrolled: 0, strangersToday: 0, unitCodes: [], ...createBuildingDto,
    }));
  }

  findAll() {
    return this.buildings.find({ order: { code: 'ASC' } });
  }

  async enrollmentOptions() {
    const buildings = await this.findAll();
    return buildings.map((building) => ({
      code: building.code,
      name: building.name,
      units: building.unitCodes?.length ? building.unitCodes : this.generateUnitCodes(building),
    }));
  }

  async findOne(code: string) {
    const building = await this.buildings.findOne({ where: { code } });
    if (!building) throw new NotFoundException('Building not found');
    return building;
  }

  async update(code: string, updateBuildingDto: UpdateBuildingDto) {
    const building = await this.findOne(code);
    Object.assign(building, updateBuildingDto, { code: building.code });
    return this.buildings.save(building);
  }

  async remove(code: string) {
    const building = await this.findOne(code);
    await this.buildings.remove(building);
    return { code, deleted: true };
  }

  private generateUnitCodes(building: Building) {
    const prefix = building.code.includes('-') ? building.code.split('-').at(-1)! : building.code;
    return Array.from({ length: building.units }, (_, index) => {
      const floor = String(Math.floor(index / 6) + 1).padStart(2, '0');
      const unit = String((index % 6) + 1).padStart(2, '0');
      return `${prefix}-${floor}${unit}`;
    });
  }
}
