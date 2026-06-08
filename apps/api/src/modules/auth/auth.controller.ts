import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
// import { LoginDto } from './dto/login.dto'; // Comentado — login por email/password deshabilitado
import { GoogleLoginDto } from './dto/google-login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // ─── LOGIN CON EMAIL/PASSWORD (COMENTADO) ───────────────────────────
  // @Post('login')
  // @HttpCode(200)
  // login(@Body() dto: LoginDto, @Req() req: Request) {
  //   const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? null;
  //   return this.auth.login(dto.email, dto.password, ip);
  // }

  // ─── LOGIN CON GOOGLE ───────────────────────────────────────────────
  @Post('google')
  @HttpCode(200)
  googleLogin(@Body() dto: GoogleLoginDto, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? null;
    return this.auth.loginWithGoogle(dto.credential, ip);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
