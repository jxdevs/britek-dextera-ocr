import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { GeminiService } from '../ai/gemini.service';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

@Controller('extraction')
export class ExtractionController {
  constructor(private readonly gemini: GeminiService) {}

  @Post('test')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_BYTES },
    }),
  )
  async test(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('model') model?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded. Send multipart/form-data with field "file".');
    }
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported mime type "${file.mimetype}". Allowed: ${ALLOWED_MIME.join(', ')}.`,
      );
    }

    const result = await this.gemini.extractInvoice({
      model,
      mimeType: file.mimetype,
      imageBase64: file.buffer.toString('base64'),
    });

    return {
      ...result,
      file: {
        original_name: file.originalname,
        size_bytes: file.size,
        mime_type: file.mimetype,
      },
    };
  }
}
