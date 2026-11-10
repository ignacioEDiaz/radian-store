import { createQueryClient } from '../app/queryClient';
import { installThemeBridge } from '../theme-bridge';

/**
 * Home: el documento es el del tema original, sin tocar. Este bundle solo conecta sus controles
 * (carrito, búsqueda, cuenta) con el backend.
 */
installThemeBridge(createQueryClient());
