/**
 * Check if a string contains HTML tags.
 */
export function isHtmlContent(text: string | null | undefined): boolean {
  if (!text) return false;
  return /<[a-z][\s\S]*>/i.test(text);
}

/**
 * Check if an HTML string has no visible text content.
 */
export function isEmptyHtml(text: string | null | undefined): boolean {
  if (!text) return true;
  const stripped = text.replace(/<[^>]*>/g, "").trim();
  return stripped.length === 0;
}
