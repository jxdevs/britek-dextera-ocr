import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StorageService } from '../storage/storage.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ListInvoicesDto } from './dto/list-invoices.dto';
import { InvoicesService } from './invoices.service';

const MAX_BYTES = 10 * 1024 * 1024;

@Controller('invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InvoicesController {
  constructor(
    private readonly service: InvoicesService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  @Roles('admin', 'approver')
  list(@Query() query: ListInvoicesDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @Roles('admin', 'approver')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/boxes')
  @Roles('admin', 'approver')
  eligibleBoxes(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.eligibleBoxesFor(id);
  }

  @Get(':id/image')
  @Roles('admin', 'approver')
  @Header('Cache-Control', 'private, max-age=300')
  async image(@Param('id', new ParseUUIDPipe()) id: string): Promise<StreamableFile> {
    const { imageUrl, mimeType } = await this.service.getImagePath(id);
    const stream = await this.storage.getStream(imageUrl);
    return new StreamableFile(stream, { type: mimeType });
  }

  @Post()
  @Roles('admin', 'approver')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  async create(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: CreateInvoiceDto,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Falta el archivo. Envía multipart/form-data con campo "file" y worker_id.',
      );
    }
    return this.service.createFromUpload(file, dto.worker_id);
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
