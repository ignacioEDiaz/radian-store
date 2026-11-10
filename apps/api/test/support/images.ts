import sharp from 'sharp';

/** Imagen JPEG sintética con metadatos EXIF (incluye "GPS") para verificar que se eliminan. */
export function jpegWithExif(width = 1000, height = 1300): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 120, g: 20, b: 40 } } })
    .withExif({ IFD0: { Copyright: 'Radian', Artist: 'GPS-LEAK' } })
    .jpeg()
    .toBuffer();
}

export function png(width = 400, height = 400): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
}

/** Un PDF con extensión .png: el contenido real no es una imagen. */
export const fakePngThatIsPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
