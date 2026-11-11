import { useEffect } from 'react';
import { BRAND_NAME } from '../../app/brand';

/** Título de la pestaña: "Página · Marca". */
export function usePageTitle(title: string | null | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} · ${BRAND_NAME}` : BRAND_NAME;
  }, [title]);
}
