import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AssignWorkersDto } from './dto/assign-workers.dto';
import { CreateBoxDto } from './dto/create-box.dto';
import { UpdateBoxDto } from './dto/update-box.dto';
import { PettyCashService } from './petty-cash.service';

@Controller('petty-cash')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PettyCashController {
  constructor(private readonly service: PettyCashService) {}

  @Get()
  @Roles('admin', 'approver')
  list() {
    return this.service.list();
  }

  @Get(':id')
  @Roles('admin', 'approver')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateBoxDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @Roles('admin')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBoxDto,
  ) {
    return this.service.update(id, dto);
  }

  @Post(':id/close')
  @Roles('admin')
  close(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.close(id);
  }

  @Post(':id/assign')
  @Roles('admin')
  assign(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignWorkersDto,
  ) {
    return this.service.assign(id, dto);
  }

  @Get(':id/movements')
  @Roles('admin', 'approver')
  movements(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.movements(id);
  }

  @Delete(':id')
  @Roles('admin')
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.remove(id, user);
  }
}
