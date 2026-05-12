import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { WorkerRole } from '../../../database/models/worker.model';

export interface AuthUser {
  id: string;
  email: string | null;
  name: string;
  role: WorkerRole;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest().user,
);
