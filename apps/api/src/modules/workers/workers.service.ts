import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { UniqueConstraintError } from 'sequelize';
import { Worker } from '../../database/models';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
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
  constructor(
    @InjectModel(Worker) private readonly workers: typeof Worker,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.workers.findAll({
      attributes: [...PUBLIC_ATTRS],
      order: [['created_at', 'DESC']],
    });
  }

  async findOne(id: string) {
    const w = await this.workers.findByPk(id, { attributes: [...PUBLIC_ATTRS] });
    if (!w) throw new NotFoundException('Residente no encontrado');
    return w;
  }

  async create(dto: CreateWorkerDto, user: AuthUser) {
    const role = dto.role ?? 'worker';
    try {
      const created = await this.workers.create({
        document_number: dto.document_number,
        name: dto.name,
        phone: dto.phone,
        email: dto.email ?? null,
        role,
        password_hash: null,
      });

      const result = await this.findOne(created.id);

      this.audit.log({
        user,
        action: 'create',
        entity: 'worker',
        entityId: created.id,
        entityLabel: dto.name,
        after: AuditService.sanitize(result.toJSON()),
      });

      return result;
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async update(id: string, dto: UpdateWorkerDto, user: AuthUser) {
    const worker = await this.workers.findByPk(id);
    if (!worker) throw new NotFoundException('Residente no encontrado');

    const beforeData = AuditService.sanitize(worker.toJSON());

    try {
      await worker.update({
        document_number: dto.document_number ?? worker.document_number,
        name: dto.name ?? worker.name,
        phone: dto.phone ?? worker.phone,
        email: dto.email !== undefined ? dto.email : worker.email,
        role: dto.role ?? worker.role,
        password_hash: worker.password_hash,
      });

      const result = await this.findOne(id);
      const afterData = AuditService.sanitize(result.toJSON());
      const diff = AuditService.diff(beforeData, afterData);

      // Only log if something actually changed
      if (Object.keys(diff.before).length > 0) {
        this.audit.log({
          user,
          action: 'update',
          entity: 'worker',
          entityId: id,
          entityLabel: worker.name,
          before: diff.before,
          after: diff.after,
        });
      }

      return result;
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async remove(id: string, user: AuthUser) {
    const worker = await this.workers.findByPk(id);
    if (!worker) throw new NotFoundException('Residente no encontrado');

    const beforeData = AuditService.sanitize(worker.toJSON());

    await worker.destroy();

    this.audit.log({
      user,
      action: 'delete',
      entity: 'worker',
      entityId: id,
      entityLabel: worker.name,
      before: beforeData,
    });

    return { id };
  }

  private mapError(err: unknown) {
    if (err instanceof UniqueConstraintError) {
      return new ConflictException(
        `Ya existe un residente con ${err.errors.map((e) => e.path).join(', ')}`,
      );
    }
    return err as Error;
  }
}
