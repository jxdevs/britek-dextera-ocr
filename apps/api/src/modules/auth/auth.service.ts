import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/sequelize';
import * as bcrypt from 'bcrypt';
import { Worker } from '../../database/models';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(Worker) private readonly workers: typeof Worker,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const worker = await this.workers.findOne({ where: { email } });

    if (!worker || !worker.password_hash) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    if (worker.role === 'worker') {
      throw new UnauthorizedException('Los trabajadores se autentican por WhatsApp');
    }
    const ok = await bcrypt.compare(password, worker.password_hash);
    if (!ok) throw new UnauthorizedException('Credenciales inválidas');

    const token = await this.jwt.signAsync({
      sub: worker.id,
      email: worker.email,
      role: worker.role,
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
