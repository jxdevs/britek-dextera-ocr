import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApprovalsService } from './approvals.service';
import { DecideDto } from './dto/decide.dto';

@Controller('approvals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApprovalsController {
  constructor(private readonly service: ApprovalsService) {}

  @Post()
  @Roles('admin', 'approver')
  @HttpCode(200)
  decide(@Body() dto: DecideDto, @CurrentUser() user: AuthUser) {
    return this.service.decide(dto, user);
  }
}
