import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import type { Readable } from 'stream';

type StorageDriver = 'local' | 's3';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private driver!: StorageDriver;

  // Local
  private baseDir!: string;

  // S3
  private s3!: S3Client;
  private bucket!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.driver = (this.config.get<string>('storage.driver') ?? 'local') as StorageDriver;

    if (this.driver === 's3') {
      const accessKeyId = this.config.get<string>('storage.s3.accessKeyId')!;
      const secretAccessKey = this.config.get<string>('storage.s3.secretAccessKey')!;
      const region = this.config.get<string>('storage.s3.region') ?? 'us-east-1';
      this.bucket = this.config.get<string>('storage.s3.bucket')!;

      this.s3 = new S3Client({
        region,
        credentials: { accessKeyId, secretAccessKey },
      });

      this.logger.log(`S3 storage initialized — bucket: ${this.bucket}, region: ${region}`);
    } else {
      const localPath = this.config.get<string>('storage.localPath') ?? './uploads';
      this.baseDir = path.isAbsolute(localPath)
        ? localPath
        : path.resolve(process.cwd(), localPath);
      fs.mkdirSync(this.baseDir, { recursive: true });
      this.logger.log(`Local storage initialized at ${this.baseDir}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PUT — guardar archivo
  // ═══════════════════════════════════════════════════════════════

  async put(buffer: Buffer, originalName: string): Promise<string> {
    const ext = path.extname(originalName).toLowerCase() || '.bin';
    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const filename = `${randomUUID()}${ext}`;
    const key = `invoices/${yyyy}/${mm}/${filename}`;

    if (this.driver === 's3') {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: this.mimeTypeFromExt(ext),
        }),
      );
      this.logger.debug(`S3 PUT s3://${this.bucket}/${key}`);
      return key;
    }

    // Local
    const relative = path.posix.join(yyyy, mm, filename);
    const absolute = path.join(this.baseDir, yyyy, mm, filename);
    await fs.promises.mkdir(path.dirname(absolute), { recursive: true });
    await fs.promises.writeFile(absolute, buffer);
    return relative;
  }

  // ═══════════════════════════════════════════════════════════════
  // GET — obtener contenido del archivo como buffer
  // ═══════════════════════════════════════════════════════════════

  async getBuffer(relativePath: string): Promise<Buffer> {
    if (this.driver === 's3') {
      const response = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: relativePath }),
      );
      const stream = response.Body as Readable;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    }

    // Local
    return fs.promises.readFile(this.absolute(relativePath));
  }

  // ═══════════════════════════════════════════════════════════════
  // GET STREAM — obtener stream (para streaming directo al cliente)
  // ═══════════════════════════════════════════════════════════════

  async getStream(relativePath: string): Promise<Readable> {
    if (this.driver === 's3') {
      const response = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: relativePath }),
      );
      return response.Body as Readable;
    }

    // Local
    return fs.createReadStream(this.absolute(relativePath));
  }

  // ═══════════════════════════════════════════════════════════════
  // DELETE — eliminar archivo
  // ═══════════════════════════════════════════════════════════════

  async delete(relativePath: string): Promise<void> {
    try {
      if (this.driver === 's3') {
        await this.s3.send(
          new DeleteObjectCommand({ Bucket: this.bucket, Key: relativePath }),
        );
        this.logger.debug(`S3 DELETE s3://${this.bucket}/${relativePath}`);
      } else {
        const abs = this.absolute(relativePath);
        await fs.promises.unlink(abs);
      }
    } catch (err) {
      this.logger.warn(`No se pudo eliminar ${relativePath}: ${err}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Utilidades
  // ═══════════════════════════════════════════════════════════════

  /** Solo para driver local: ruta absoluta en disco */
  absolute(relativePath: string): string {
    return path.join(this.baseDir, relativePath);
  }

  mimeTypeFromPath(relativePath: string): string {
    const ext = path.extname(relativePath).toLowerCase();
    return this.mimeTypeFromExt(ext);
  }

  private mimeTypeFromExt(ext: string): string {
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.pdf') return 'application/pdf';
    return 'application/octet-stream';
  }
}
