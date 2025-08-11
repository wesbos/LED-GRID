// Utility functions shared across the project

/**
 * Convert various color strings (e.g. '#RRGGBB', '#RGB', 'rgb(r,g,b)', 'rgba(r,g,b,a)')
 * to a WLED-compatible 6-digit uppercase hex string without the leading '#'.
 */
export function toHex(color: string | undefined): string {
  if (!color) return "000000";
  const c = color.trim();
  if (c.startsWith("#")) {
    const hex = c.slice(1);
    if (hex.length === 3) {
      const r = hex[0];
      const g = hex[1];
      const b = hex[2];
      return (r + r + g + g + b + b).toUpperCase();
    }
    return hex.slice(0, 6).toUpperCase();
  }
  const m =
    c.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i) ||
    c.match(
      /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0|0?\.\d+|1(?:\.0)?)\s*\)$/i
    );
  if (m) {
    const r = Math.max(0, Math.min(255, Number(m[1])));
    const g = Math.max(0, Math.min(255, Number(m[2])));
    const b = Math.max(0, Math.min(255, Number(m[3])));
    const hex = (n: number) => n.toString(16).padStart(2, "0");
    return `${hex(r)}${hex(g)}${hex(b)}`.toUpperCase();
  }
  // Fallback: assume already hex without '#'
  return c.toUpperCase();
}


