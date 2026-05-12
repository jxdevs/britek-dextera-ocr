import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectModel } from '@nestjs/sequelize';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Worker } from '../../../database/models';
import type { AuthUser } from '../decorators/current-user.decorator';

interface JwtPayload {
  sub: string;
  email: string | null;
  role: AuthUser['role'];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectModel(Worker) private readonly workers: typeof Worker,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret')!,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const worker = await this.workers.findByPk(payload.sub);
    if (!worker) throw new UnauthorizedException('User no longer exists');
    return {
      id: worker.id,
      email: worker.email,
      name: worker.name,
      role: worker.role,
    };
  }
}
