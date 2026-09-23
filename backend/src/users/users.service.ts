import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly userRepo: Repository<User>) {}

  private secret() { return process.env.JWT_SECRET || 'change-this-development-secret'; }
  private hash(password: string, salt = randomBytes(16).toString('hex')) { return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; }
  private verify(password: string, stored: string) {
    const [salt, digest] = stored.split(':');
    const candidate = scryptSync(password, salt, 64).toString('hex');
    return timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(candidate, 'hex'));
  }

  async login(username: string, password: string) {
    const user = await this.userRepo.createQueryBuilder('user').addSelect('user.passwordHash').where('user.u = :username', { username }).getOne();
    if (!user || user.status !== 'active' || !user.passwordHash || !this.verify(password, user.passwordHash)) throw new UnauthorizedException('Invalid username or password');
    const payload = { sub: user.u, role: user.role, exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60 };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.secret()).update(encoded).digest('base64url');
    return { accessToken: `${encoded}.${signature}`, user: user.u, role: user.role, name: user.name, expiresAt: payload.exp };
  }

  async findAll() {
    return this.userRepo.find({ select: { u: true, name: true, role: true, status: true } });
  }

  async findOne(id: string) {
    return this.userRepo.findOneByOrFail({ u: id });
  }

  update(id: string, updateUserDto: UpdateUserDto) { return this.userRepo.update({ u: id }, updateUserDto); }
  async remove(id: string) { return this.userRepo.remove(await this.findOne(id)); }
  async create(createUserDto: CreateUserDto) { return this.userRepo.save(createUserDto); }

  async setPassword(username: string, password: string) {
    await this.userRepo.update({ u: username }, { passwordHash: this.hash(password) });
  }
}
