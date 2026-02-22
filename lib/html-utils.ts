/**
 * Check if a string contains HTML tags.
 */
export function isHtmlContent(text: string | null | undefined): boolean {
  if (!text) return false;
  return /<[a-z][\s\S]*>/i.test(text);
}

/**
 * Check if an HTML string has no visible text content.
 * Note: This is NOT used for sanitization (DOMPurify handles that).
 * It only checks whether there is any text after removing tags.
 */
export function isEmptyHtml(text: string | null | undefined): boolean {
  if (!text) return true;
  // Iteratively strip tags to handle nested incomplete tags
  let stripped = text;
  let prev = "";
  while (stripped !== prev) {
    prev = stripped;
    stripped = stripped.replace(/<[^>]*>/g, "");
  }
  return stripped.trim().length === 0;
}
