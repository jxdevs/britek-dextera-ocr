import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/sequelize';
import * as bcrypt from 'bcrypt';
import { Worker } from '../../database/models';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(Worker) private readonly workers: typeof Worker,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string, ip?: string | null) {
    const worker = await this.workers.findOne({ where: { email } });

    if (!worker || !worker.password_hash) {
      this.audit.log({
        user: null,
        action: 'login_failed',
        entity: 'session',
        entityLabel: email,
        after: { email, reason: 'Credenciales inválidas' },
        ip,
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }
    if (worker.role === 'worker') {
      this.audit.log({
        user: { id: worker.id, name: worker.name, role: worker.role },
        action: 'login_failed',
        entity: 'session',
        entityLabel: email,
        after: { email, reason: 'Trabajador intenta login por dashboard' },
        ip,
      });
      throw new UnauthorizedException('Los trabajadores se autentican por WhatsApp');
    }
    const ok = await bcrypt.compare(password, worker.password_hash);
    if (!ok) {
      this.audit.log({
        user: { id: worker.id, name: worker.name, role: worker.role },
        action: 'login_failed',
        entity: 'session',
        entityLabel: email,
        after: { email, reason: 'Contraseña incorrecta' },
        ip,
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const token = await this.jwt.signAsync({
      sub: worker.id,
      email: worker.email,
      role: worker.role,
    });

    // Log successful login (fire-and-forget)
    this.audit.log({
      user: { id: worker.id, name: worker.name, role: worker.role },
      action: 'login_success',
      entity: 'session',
      entityLabel: worker.email ?? worker.name,
      ip,
    });

    return {
      access_token: token,
      user: {
        id: worker.id,
        email: worker.email,
        name: worker.name,
        role: worker.role,
      },
    };
  }
}
