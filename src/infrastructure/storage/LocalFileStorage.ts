import fs from 'fs/promises';
import path from 'path';
import { config } from '../../shared/config';

export class LocalFileStorage {
  private uploadsDir = path.resolve(process.cwd(), config.uploadsDir);

  async save(filename: string, buffer: Buffer): Promise<void> {
    await fs.mkdir(this.uploadsDir, { recursive: true });
    await fs.writeFile(path.join(this.uploadsDir, filename), buffer);
  }

  async delete(filename: string): Promise<void> {
    try {
      await fs.unlink(path.join(this.uploadsDir, filename));
    } catch {
      // file may not exist
    }
  }

  getUrl(filename: string): string {
    return `/uploads/${filename}`;
  }
}
