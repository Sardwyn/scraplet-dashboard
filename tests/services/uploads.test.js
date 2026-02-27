import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as uploadService from '../../services/uploads.js';

describe('Upload services', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scraplet-uploads-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tempRoot, { recursive: true, force: true });
  });

  it('creates missing directories', () => {
    const target = path.join(tempRoot, 'nested/path');
    expect(fs.existsSync(target)).toBe(false);

    uploadService.ensureUploadDir(target);

    expect(fs.existsSync(target)).toBe(true);
  });

  it('verifies when a directory is writable', async () => {
    const writable = await uploadService.verifyWritable(tempRoot);
    expect(writable).toBe(true);
  });

  it('throws if the upload directory cannot be written to', async () => {
    const locked = path.join(tempRoot, 'locked');
    uploadService.ensureUploadDir(locked);
    const accessSpy = jest.spyOn(fs.promises, 'access').mockRejectedValue(new Error('denied'));

    await expect(uploadService.prepareUploadDirectory(locked)).rejects.toThrow('not writable');

    accessSpy.mockRestore();
  });
});
