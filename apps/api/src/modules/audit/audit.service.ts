import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { AuditLog, type AuditAction } from '../../database/models';

export interface AuditLogInput {
  user: { id: string; name: string; role: string } | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  entityLabel?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string | null;
}

export interface AuditListFilters {
  action?: string;
  entity?: string;
  entityId?: string;
  userId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectModel(AuditLog) private readonly logs: typeof AuditLog,
  ) {}

  /** Fire-and-forget audit log — errors are caught and logged, never thrown */
  async log(input: AuditLogInput): Promise<void> {
    try {
      await this.logs.create({
        user_id: input.user?.id ?? null,
        user_name: input.user?.name ?? 'sistema',
        user_role: input.user?.role ?? 'unknown',
        action: input.action,
        entity: input.entity,
        entity_id: input.entityId ?? null,
        entity_label: input.entityLabel ?? null,
        before: input.before ?? null,
        after: input.after ?? null,
        ip: input.ip ?? null,
      });
    } catch (err) {
      this.logger.error(`Failed to write audit log: ${err}`, (err as Error).stack);
    }
  }

  async list(filters: AuditListFilters = {}) {
    const where: Record<string, unknown> = {};

    if (filters.action) where.action = filters.action;
    if (filters.entity) where.entity = filters.entity;
    if (filters.entityId) where.entity_id = filters.entityId;
    if (filters.userId) where.user_id = filters.userId;

    if (filters.from || filters.to) {
      const range: Record<symbol, unknown> = {};
      if (filters.from) range[Op.gte] = new Date(filters.from);
      if (filters.to) range[Op.lte] = new Date(filters.to);
      where.created_at = range;
    }

    const limit = Math.min(filters.limit ?? 50, 200);
    const offset = filters.offset ?? 0;

    return this.logs.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });
  }

  /**
   * Helper: compute a before/after diff, excluding sensitive fields.
   * Returns only the fields that changed.
   */
  static diff(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    exclude: string[] = ['password_hash', 'password', 'updated_at', 'created_at'],
  ): { before: Record<string, unknown>; after: Record<string, unknown> } {
    const b: Record<string, unknown> = {};
    const a: Record<string, unknown> = {};

    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of allKeys) {
      if (exclude.includes(key)) continue;
      const bv = before[key];
      const av = after[key];
      if (JSON.stringify(bv) !== JSON.stringify(av)) {
        b[key] = bv;
        a[key] = av;
      }
    }

    return { before: b, after: a };
  }

  /**
   * Helper: sanitize a record for logging (remove sensitive fields)
   */
  static sanitize(
    data: Record<string, unknown>,
    exclude: string[] = ['password_hash', 'password'],
  ): Record<string, unknown> {
    const result = { ...data };
    for (const key of exclude) {
      delete result[key];
    }
    return result;
  }
}
