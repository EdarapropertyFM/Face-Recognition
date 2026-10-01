import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
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

  /**
   * Ordered explicitly. Without it Postgres returns rows in physical order,
   * so an updated row moves to the end of the table and the user who was
   * just activated jumps to the bottom of the list -- which reads as the
   * screen misbehaving rather than as a sort.
   */
  async findAll() {
    return this.userRepo.find({
      select: { u: true, name: true, role: true, status: true },
      order: { u: 'ASC' },
    });
  }

  async findOne(id: string) {
    return this.userRepo.findOneByOrFail({ u: id });
  }

  /**
   * The password is hashed here and never stored as given. The DTO carries a
   * plaintext `password`, which is not a column -- writing the DTO straight
   * to the repository (as this used to) left the account with no
   * passwordHash at all, and login refuses an account that has none.
   */
  async create(createUserDto: CreateUserDto) {
    const { password, ...rest } = createUserDto;
    const username = rest.u;
    if (await this.userRepo.findOne({ where: { u: username } })) {
      throw new ConflictException(`A user named ${username} already exists`);
    }
    await this.userRepo.save(this.userRepo.create({
      ...rest,
      status: rest.status ?? 'active',
      passwordHash: this.hash(password),
    }));
    // Re-read through findAll's projection so no hash leaves this method.
    return this.userRepo.findOne({ where: { u: username }, select: { u: true, name: true, role: true, status: true } });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const { password, ...rest } = updateUserDto;
    const user = await this.userRepo.findOne({ where: { u: id } });
    if (!user) throw new NotFoundException(`No such user: ${id}`);

    // Demoting or disabling the only remaining Admin locks every person
    // out of the system with no way back in, so it is refused.
    const losesAdmin = user.role === 'Admin'
      && ((rest.role && rest.role !== 'Admin') || rest.status === 'disabled');
    if (losesAdmin) {
      const admins = await this.userRepo.count({ where: { role: 'Admin', status: 'active' } });
      if (admins <= 1) throw new ConflictException('This is the last active Admin; promote another first');
    }

    const changes: Partial<User> = { ...rest };
    if (password) changes.passwordHash = this.hash(password);
    // An empty PATCH would otherwise reach TypeORM and throw.
    if (Object.keys(changes).length) await this.userRepo.update({ u: id }, changes);
    return this.userRepo.findOne({ where: { u: id }, select: { u: true, name: true, role: true, status: true } });
  }

  /**
   * `actor` is the signed-in admin. Deleting yourself, or the last way back
   * into the system, is refused: both are one-way doors.
   */
  async remove(id: string, actor?: string) {
    const user = await this.userRepo.findOne({ where: { u: id } });
    if (!user) throw new NotFoundException(`No such user: ${id}`);
    if (actor && actor === id) {
      throw new ConflictException('You cannot delete the account you are signed in with');
    }
    if (user.role === 'Admin') {
      const admins = await this.userRepo.count({ where: { role: 'Admin', status: 'active' } });
      if (admins <= 1) throw new ConflictException('This is the last active Admin; promote another first');
    }
    await this.userRepo.remove(user);
    return { u: id, deleted: true };
  }

  async setPassword(username: string, password: string) {
    await this.userRepo.update({ u: username }, { passwordHash: this.hash(password) });
  }
}
