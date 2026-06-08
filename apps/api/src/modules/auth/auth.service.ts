import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/sequelize';
// import * as bcrypt from 'bcrypt'; // Comentado — login por email/password deshabilitado
import { OAuth2Client } from 'google-auth-library';
import { Worker } from '../../database/models';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    @InjectModel(Worker) private readonly workers: typeof Worker,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {
    this.googleClient = new OAuth2Client(this.config.get<string>('google.clientId'));
  }

  // ─── LOGIN CON EMAIL/PASSWORD (COMENTADO) ───────────────────────────
  // async login(email: string, password: string, ip?: string | null) {
  //   const worker = await this.workers.findOne({ where: { email } });
  //
  //   if (!worker || !worker.password_hash) {
  //     this.audit.log({
  //       user: null,
  //       action: 'login_failed',
  //       entity: 'session',
  //       entityLabel: email,
  //       after: { email, reason: 'Credenciales inválidas' },
  //       ip,
  //     });
  //     throw new UnauthorizedException('Credenciales inválidas');
  //   }
  //   if (worker.role === 'worker') {
  //     this.audit.log({
  //       user: { id: worker.id, name: worker.name, role: worker.role },
  //       action: 'login_failed',
  //       entity: 'session',
  //       entityLabel: email,
  //       after: { email, reason: 'Residente intenta login por dashboard' },
  //       ip,
  //     });
  //     throw new UnauthorizedException('Los residentes se autentican por WhatsApp');
  //   }
  //   const ok = await bcrypt.compare(password, worker.password_hash);
  //   if (!ok) {
  //     this.audit.log({
  //       user: { id: worker.id, name: worker.name, role: worker.role },
  //       action: 'login_failed',
  //       entity: 'session',
  //       entityLabel: email,
  //       after: { email, reason: 'Contraseña incorrecta' },
  //       ip,
  //     });
  //     throw new UnauthorizedException('Credenciales inválidas');
  //   }
  //
  //   const token = await this.jwt.signAsync({
  //     sub: worker.id,
  //     email: worker.email,
  //     role: worker.role,
  //   });
  //
  //   // Log successful login (fire-and-forget)
  //   this.audit.log({
  //     user: { id: worker.id, name: worker.name, role: worker.role },
  //     action: 'login_success',
  //     entity: 'session',
  //     entityLabel: worker.email ?? worker.name,
  //     ip,
  //   });
  //
  //   return {
  //     access_token: token,
  //     user: {
  //       id: worker.id,
  //       email: worker.email,
  //       name: worker.name,
  //       role: worker.role,
  //     },
  //   };
  // }

  // ─── LOGIN CON GOOGLE ───────────────────────────────────────────────
  async loginWithGoogle(idToken: string, ip?: string | null) {
    const clientId = this.config.get<string>('google.clientId');

    let payload;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Token de Google inválido');
    }

    if (!payload || !payload.email) {
      throw new UnauthorizedException('No se pudo obtener el email de Google');
    }

    const email = payload.email;

    // Buscar worker por email — si no existe, rechazar acceso
    const worker = await this.workers.findOne({ where: { email } });

    if (!worker) {
      this.audit.log({
        user: null,
        action: 'login_failed',
        entity: 'session',
        entityLabel: email,
        after: { email, reason: 'Usuario no registrado en el sistema' },
        ip,
      });
      throw new UnauthorizedException(
        'No tienes acceso. Tu cuenta de Google no está registrada en el sistema.',
      );
    }

    if (worker.role === 'worker') {
      this.audit.log({
        user: { id: worker.id, name: worker.name, role: worker.role },
        action: 'login_failed',
        entity: 'session',
        entityLabel: email,
        after: { email, reason: 'Residente intenta login por dashboard' },
        ip,
      });
      throw new UnauthorizedException('Los residentes se autentican por WhatsApp');
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
