import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import {
  PREVIEW_IMAGE_QUALITY,
  PREVIEW_MAX_DIMENSION,
  PREVIEW_MAX_INPUT_PIXELS,
  REVIEW_PREVIEW_MIME,
} from './files.constants';

export interface PreviewIdentity {
  creatorName: string;
  creatorHandle: string;
  dealRef: string;
  projectTitle: string;
}

export interface GeneratedPreview {
  bytes: Uint8Array;
  mime: typeof REVIEW_PREVIEW_MIME;
  watermark: string;
}

/**
 * Produces the bytes a client is allowed to review.
 *
 * The watermark is composited into the pixels after resize; no CSS or browser
 * layer is part of the protection. A full-frame repeated pattern makes a
 * useful crop materially harder, while a central project mark keeps ownership
 * visible. This is a strong deterrent, not DRM: any visible media can still be
 * photographed or reconstructed with enough manual effort.
 */
@Injectable()
export class PreviewGenerator {
  async generate(source: Uint8Array, identity: PreviewIdentity): Promise<GeneratedPreview> {
    const watermark = buildWatermarkLabel(identity);

    // Decode limits guard the worker from image decompression bombs. Metadata
    // is stripped by the WebP encode so camera/GPS information is not leaked.
    const reduced = await sharp(source, { failOn: 'warning', limitInputPixels: PREVIEW_MAX_INPUT_PIXELS })
      .rotate()
      .resize({
        width: PREVIEW_MAX_DIMENSION,
        height: PREVIEW_MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: PREVIEW_IMAGE_QUALITY, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    const overlay = watermarkSvg(reduced.info.width, reduced.info.height, identity);
    const bytes = await sharp(reduced.data)
      .composite([{ input: overlay, blend: 'over' }])
      .webp({ quality: PREVIEW_IMAGE_QUALITY, effort: 4 })
      .toBuffer();

    return { bytes, mime: REVIEW_PREVIEW_MIME, watermark };
  }
}

function buildWatermarkLabel(identity: PreviewIdentity): string {
  return `${identity.creatorName} (@${identity.creatorHandle}) • ${identity.dealRef} • ${identity.projectTitle} • REVIEW COPY • NOT LICENSED`;
}

function watermarkSvg(width: number, height: number, identity: PreviewIdentity): Buffer {
  const creator = escapeXml(`${identity.creatorName} • @${identity.creatorHandle}`);
  const project = escapeXml(`${identity.dealRef} • ${identity.projectTitle}`);
  const repeated = escapeXml(`${identity.dealRef} • @${identity.creatorHandle} • REVIEW COPY • NOT LICENSED`);
  const fontSize = Math.max(18, Math.min(38, Math.round(width / 30)));
  const tileWidth = Math.max(420, Math.round(width * 0.7));
  const tileHeight = Math.max(130, Math.round(fontSize * 4.2));
  const centreFont = Math.max(22, Math.min(54, Math.round(width / 22)));

  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <pattern id="review-mark" width="${tileWidth}" height="${tileHeight}" patternUnits="userSpaceOnUse" patternTransform="rotate(-28)">
          <text x="12" y="${fontSize * 1.4}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="800"
            letter-spacing="2" fill="white" fill-opacity="0.34" stroke="black" stroke-opacity="0.22" stroke-width="1.5"
            paint-order="stroke">${repeated}</text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#review-mark)"/>
      <g transform="translate(${width / 2} ${height / 2}) rotate(-12)" text-anchor="middle"
        font-family="Arial, sans-serif" font-weight="900" paint-order="stroke" stroke="black" stroke-opacity="0.45" stroke-width="2">
        <text y="-${centreFont * 0.35}" font-size="${centreFont}" fill="white" fill-opacity="0.62">${creator}</text>
        <text y="${centreFont * 0.9}" font-size="${Math.round(centreFont * 0.72)}" fill="white" fill-opacity="0.62">${project}</text>
        <text y="${centreFont * 2}" font-size="${Math.round(centreFont * 0.58)}" letter-spacing="4" fill="white" fill-opacity="0.72">REVIEW COPY • NOT LICENSED</text>
      </g>
    </svg>
  `);
}

function escapeXml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&apos;',
      '"': '&quot;',
    };
    return entities[character]!;
  });
}
