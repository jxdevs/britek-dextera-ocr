import { SetMetadata } from '@nestjs/common';
import type { WorkerRole } from '../../../database/models/worker.model';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: WorkerRole[]) => SetMetadata(ROLES_KEY, roles);
