import * as fs from 'fs/promises';
import * as path from 'path';
import { LocalStorageProvider } from './local-storage.provider';

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

describe('LocalStorageProvider', () => {
  let provider: LocalStorageProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new LocalStorageProvider();
  });

  it('should return a /uploads/products/ URL', async () => {
    const url = await provider.save(Buffer.from('img'), 'abc.jpg', 'image/jpeg');
    expect(url).toBe('/uploads/products/abc.jpg');
  });

  it('should write the file to the uploads/products directory', async () => {
    await provider.save(Buffer.from('img'), 'abc.jpg', 'image/jpeg');
    const [writePath] = (fs.writeFile as jest.Mock).mock.calls[0];
    expect(writePath).toContain(path.join('uploads', 'products', 'abc.jpg'));
  });

  it('should create the directory recursively', async () => {
    await provider.save(Buffer.from('img'), 'abc.jpg', 'image/jpeg');
    expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining(path.join('uploads', 'products')), { recursive: true });
  });
});
