import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import * as bcrypt from 'bcrypt';
import { UniqueConstraintError } from 'sequelize';
import { Worker } from '../../database/models';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { UpdateWorkerDto } from './dto/update-worker.dto';

const PUBLIC_ATTRS = [
  'id',
  'document_number',
  'name',
  'phone',
  'email',
  'role',
  'created_at',
  'updated_at',
] as const;

@Injectable()
export class WorkersService {
  constructor(@InjectModel(Worker) private readonly workers: typeof Worker) {}

  list() {
    return this.workers.findAll({
      attributes: [...PUBLIC_ATTRS],
      order: [['created_at', 'DESC']],
    });
  }

  async findOne(id: string) {
    const w = await this.workers.findByPk(id, { attributes: [...PUBLIC_ATTRS] });
    if (!w) throw new NotFoundException('Trabajador no encontrado');
    return w;
  }

  async create(dto: CreateWorkerDto) {
    const role = dto.role ?? 'worker';
    if (role !== 'worker' && (!dto.email || !dto.password)) {
      throw new BadRequestException(
        'Admin y approver requieren email y password para iniciar sesión',
      );
    }
    try {
      const created = await this.workers.create({
        document_number: dto.document_number,
        name: dto.name,
        phone: dto.phone,
        email: dto.email ?? null,
        role,
        password_hash: dto.password ? await bcrypt.hash(dto.password, 10) : null,
      });
      return this.findOne(created.id);
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async update(id: string, dto: UpdateWorkerDto) {
    const worker = await this.workers.findByPk(id);
    if (!worker) throw new NotFoundException('Trabajador no encontrado');

    try {
      await worker.update({
        document_number: dto.document_number ?? worker.document_number,
        name: dto.name ?? worker.name,
        phone: dto.phone ?? worker.phone,
        email: dto.email !== undefined ? dto.email : worker.email,
        role: dto.role ?? worker.role,
        password_hash: dto.password
          ? await bcrypt.hash(dto.password, 10)
          : worker.password_hash,
      });
      return this.findOne(id);
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async remove(id: string) {
    const worker = await this.workers.findByPk(id);
    if (!worker) throw new NotFoundException('Trabajador no encontrado');
    await worker.destroy();
    return { id };
  }

  private mapError(err: unknown) {
    if (err instanceof UniqueConstraintError) {
      return new ConflictException(
        `Ya existe un trabajador con ${err.errors.map((e) => e.path).join(', ')}`,
      );
    }
    return err as Error;
  }
}
