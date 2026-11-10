/** Solo permite redirecciones internas (evita open redirects tipo `?redirect=https://evil`). */
export function safeRedirect(target: string | null, fallback: string): string {
  if (!target || !target.startsWith('/') || target.startsWith('//')) return fallback;
  return target;
}
