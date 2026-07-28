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
import { BoxDocumentsService } from './box-documents.service';
import { AssignDocumentDto } from './dto/assign-document.dto';
import { CreateBoxDocumentDto } from './dto/create-box-document.dto';

const MAX_BYTES = 10 * 1024 * 1024;

@Controller('box-documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BoxDocumentsController {
  constructor(
    private readonly service: BoxDocumentsService,
    private readonly storage: StorageService,
  ) {}

  /** Va antes de `@Get(':id')` para que 'unassigned' no entre al ParseUUIDPipe. */
  @Get('unassigned')
  @Roles('admin', 'approver')
  listUnassigned() {
    return this.service.listUnassigned();
  }

  @Get('box/:boxId')
  @Roles('admin', 'approver')
  listByBox(@Param('boxId', new ParseUUIDPipe()) boxId: string) {
    return this.service.listByBox(boxId);
  }

  @Get(':id/file')
  @Roles('admin', 'approver')
  @Header('Cache-Control', 'private, max-age=300')
  async file(@Param('id', new ParseUUIDPipe()) id: string): Promise<StreamableFile> {
    const { fileUrl, mimeType } = await this.service.getFilePath(id);
    const stream = await this.storage.getStream(fileUrl);
    return new StreamableFile(stream, { type: mimeType });
  }

  @Get(':id')
  @Roles('admin', 'approver')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Post('box/:boxId')
  @Roles('admin', 'approver')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  create(
    @Param('boxId', new ParseUUIDPipe()) boxId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: CreateBoxDocumentDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Falta el archivo. Envía multipart/form-data con campo "file".',
      );
    }
    return this.service.create(boxId, file, dto, user);
  }

  @Post(':id/assign')
  @Roles('admin', 'approver')
  assign(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignDocumentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.assignToBox(id, dto.box_id, user);
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
