import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { promises as fs } from 'fs';
import { join } from 'path';

@Injectable()
export class StorageService {
  private s3Client: S3Client;
  private bucket: string;

  constructor(private configService: ConfigService) {
    const region = this.configService.get<string>('STORAGE_REGION') || 'us-east-1';
    const accessKeyId = this.configService.get<string>('STORAGE_ACCESS_KEY');
    const secretAccessKey = this.configService.get<string>('STORAGE_SECRET_KEY');
    this.bucket = this.configService.get<string>('STORAGE_BUCKET') || 'refentra-resumes';

    if (accessKeyId && secretAccessKey) {
      this.s3Client = new S3Client({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        // Support for Railway-style custom endpoints (e.g. for R2/B2/etc.)
        endpoint: this.configService.get<string>('STORAGE_ENDPOINT'),
        forcePathStyle: !!this.configService.get<string>('STORAGE_ENDPOINT'),
      });
    } else {
      console.warn('Storage credentials not configured. Native S3/Railway Storage disabled.');
    }
  }

  private async uploadToLocal(file: any, folder: string): Promise<string> {
    const uploadsRoot = join(process.cwd(), 'uploads', folder);
    await fs.mkdir(uploadsRoot, { recursive: true });

    const safeName = (file.originalname || 'resume')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_');
    const fileName = `${Date.now()}-${safeName}`;
    const fullPath = join(uploadsRoot, fileName);

    await fs.writeFile(fullPath, file.buffer);

    const port = this.configService.get<string>('PORT') || '4000';
    const baseUrl = this.configService.get<string>('API_PUBLIC_BASE_URL') || `http://127.0.0.1:${port}`;
    return `${baseUrl}/uploads/${folder}/${fileName}`;
  }

  async uploadFile(file: any, folder: string): Promise<string> {
    if (!this.s3Client) {
      return this.uploadToLocal(file, folder);
    }

    const fileName = `${folder}/${Date.now()}-${file.originalname.replace(/ /g, '_')}`;
    
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'public-read', // Ensure it's public if needed, or use presigned URLs for private buckets
    });

    try {
      await this.s3Client.send(command);
      
      // If using standard AWS S3
      const endpoint = this.configService.get<string>('STORAGE_ENDPOINT');
      if (endpoint) {
        // Custom endpoint style (e.g. Cloudflare R2, Backblaze B2)
        return `${endpoint.replace(/\/$/, '')}/${this.bucket}/${fileName}`;
      }
      return `https://${this.bucket}.s3.${this.configService.get('STORAGE_REGION') || 'us-east-1'}.amazonaws.com/${fileName}`;
    } catch (error) {
      console.warn('S3 upload failed, using local storage fallback:', (error as any)?.message || error);
      return this.uploadToLocal(file, folder);
    }
  }
}
