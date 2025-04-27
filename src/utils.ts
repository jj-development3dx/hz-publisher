/**
 * Formatea un enlace para mostrarlo en Discord
 * @param url URL a formatear
 * @param label Etiqueta a mostrar
 * @returns Texto formateado para Discord
 */
export function formatLink(url: string, label: string): string {
  if (!url) return "";
  return `[${label}](${url})`;
} 