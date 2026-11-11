import { useEffect, useRef, type DependencyList, type RefObject } from 'react';

interface ThemeHooks {
  Axiom?: {
    initMotionLabels?: (root: Element) => void;
    initAnimations?: (root: Element) => void;
  };
  AxiomProductCard?: { initialize?: (root: Element) => void };
}

/**
 * El JavaScript del tema inicializa animaciones (aparición al hacer scroll, textos de botones,
 * hover de tarjetas) sobre el markup presente al cargar. Para el contenido que React agrega
 * después se le pide que lo haga de nuevo sobre ese nodo, con las mismas funciones que usa él.
 */
export function enhanceThemeMarkup(root: Element | null): void {
  if (!root) return;
  const theme = window as unknown as ThemeHooks;
  try {
    theme.Axiom?.initMotionLabels?.(root);
    theme.Axiom?.initAnimations?.(root);
    theme.AxiomProductCard?.initialize?.(root);
  } catch {
    // Una animación que no se pudo inicializar nunca debe romper la página.
  }
}

/** Devuelve un `ref`; al montar (y cuando cambian `deps`) aplica las animaciones del tema a ese nodo. */
export function useThemeEnhance<T extends Element>(deps: DependencyList = []): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    enhanceThemeMarkup(ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- las dependencias las define quien llama
  }, deps);
  return ref;
}
