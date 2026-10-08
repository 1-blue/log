// This is transport cleanup, not a platform/section parser. Never infer facts
// from headings, JSON-LD or CSS selectors here; semantic extraction belongs to AI.
export function jobSourceText(value: string, html = false): string {
  let text = value;
  if (html)
    text = text
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(
        /<(script|style|noscript|template|svg|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
        "",
      )
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(?:div|p|li|h[1-6]|section|article)>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, "");
  const entities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  if (html)
    text = text.replace(
      /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
      (entity, token: string) => {
        if (token.startsWith("#")) {
          const point = /^#x/i.test(token)
            ? Number.parseInt(token.slice(2), 16)
            : Number.parseInt(token.slice(1), 10);
          return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
            ? String.fromCodePoint(point)
            : entity;
        }
        return entities[token.toLowerCase()] ?? entity;
      },
    );
  return text
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\P{Cc}\t\n]/gu, "")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
