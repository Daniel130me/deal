import { describe, expect, it } from './test-api';
import sharp from 'sharp';
import { PREVIEW_IMAGE_QUALITY, PREVIEW_MAX_DIMENSION } from '../src/modules/files/files.constants';
import { PreviewGenerator } from '../src/modules/files/preview-generator';

describe('protected preview generator', () => {
  it('bakes an ownership watermark into a reduced WebP derivative', async () => {
    const source = await sharp({
      create: { width: 2400, height: 1600, channels: 3, background: '#275df5' },
    })
      .jpeg({ quality: 95 })
      .toBuffer();

    const result = await new PreviewGenerator().generate(source, {
      creatorName: 'Ada Studio',
      creatorHandle: 'ada-studio',
      dealRef: 'DL-0042',
      projectTitle: 'Campaign Portraits',
    });
    const metadata = await sharp(result.bytes).metadata();

    expect(result.mime).toBe('image/webp');
    expect(result.watermark).toContain('Ada Studio (@ada-studio)');
    expect(result.watermark).toContain('DL-0042');
    expect(result.watermark).toContain('Campaign Portraits');
    expect(result.watermark).toContain('REVIEW COPY • NOT LICENSED');
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBe(PREVIEW_MAX_DIMENSION);
    expect(Buffer.from(result.bytes).equals(source)).toBe(false);
    expect(PREVIEW_IMAGE_QUALITY).toBeLessThan(50);
  });

  it('rejects invalid image bytes instead of passing the source through', async () => {
    await expect(
      new PreviewGenerator().generate(new Uint8Array([1, 2, 3, 4]), {
        creatorName: 'Ada Studio',
        creatorHandle: 'ada-studio',
        dealRef: 'DL-0042',
        projectTitle: 'Campaign Portraits',
      }),
    ).rejects.toThrow();
  });
});
