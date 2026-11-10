import type { ProductStatus } from '@radian/contracts';

export const STATUS_LABEL: Record<ProductStatus, string> = { published: 'Publicado', draft: 'Borrador', archived: 'Archivado' };

export const PUBLISH_REASON: Record<string, string> = {
  NO_VARIANTS: 'Agregá al menos una variante (color y talle).',
  NO_IMAGES: 'Agregá al menos una imagen.',
  IMAGE_WITHOUT_ALT: 'Todas las imágenes necesitan texto alternativo.',
};
