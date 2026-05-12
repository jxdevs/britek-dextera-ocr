import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private baseDir!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const localPath = this.config.get<string>('storage.localPath') ?? './uploads';
    this.baseDir = path.isAbsolute(localPath)
      ? localPath
      : path.resolve(process.cwd(), localPath);
    fs.mkdirSync(this.baseDir, { recursive: true });
    this.logger.log(`Local storage initialized at ${this.baseDir}`);
  }

  async put(buffer: Buffer, originalName: string): Promise<string> {
    const ext = path.extname(originalName).toLowerCase() || '.bin';
    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const filename = `${randomUUID()}${ext}`;
    const relative = path.posix.join(yyyy, mm, filename);
    const absolute = path.join(this.baseDir, yyyy, mm, filename);

    await fs.promises.mkdir(path.dirname(absolute), { recursive: true });
    await fs.promises.writeFile(absolute, buffer);

    return relative;
  }

  absolute(relativePath: string): string {
    return path.join(this.baseDir, relativePath);
  }

  mimeTypeFromPath(relativePath: string): string {
    const ext = path.extname(relativePath).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    return 'application/octet-stream';
  }
}
