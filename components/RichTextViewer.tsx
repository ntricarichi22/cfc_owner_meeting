"use client";

import DOMPurify from "isomorphic-dompurify";
import { useMemo } from "react";

interface RichTextViewerProps {
  html?: string | null;
  text?: string | null;
  items?: string[];
  className?: string;
  invert?: boolean;
}

function transformNumberedParagraphs(html: string) {
  let transformed = html;
  transformed = transformed.replace(
    /<p>\s*(\d+)\|\s*<\/p>\s*<p>/gi,
    '<p><span class="cfc-num">$1|</span> '
  );
  transformed = transformed.replace(
    /<p>\s*(\d+)\|\s+/gi,
    '<p><span class="cfc-num">$1|</span> '
  );
  return transformed;
}

export default function RichTextViewer({ html, text, items, className = "", invert = true }: RichTextViewerProps) {
  const sanitizedHtml = useMemo(() => {
    if (!html) return null;
    const safe = DOMPurify.sanitize(html);
    return transformNumberedParagraphs(safe);
  }, [html]);

  if (sanitizedHtml) {
    return (
      <div
        className={`rich-text-viewer prose prose-sm md:prose-base max-w-none break-normal whitespace-pre-wrap hyphens-none leading-relaxed ${
          invert
            ? "prose-invert text-white/90"
            : "text-[var(--ink)] prose-headings:text-[var(--ink)] prose-strong:text-[var(--ink)] prose-em:text-[var(--ink)]"
        } ${className}`}
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    );
  }

  if (items && items.length > 0) {
    return (
      <ul
        className={`rich-text-viewer list-disc list-inside space-y-2 ${
          invert ? "text-white/90" : "text-[var(--ink)]"
        } text-base md:text-lg leading-relaxed break-normal whitespace-pre-wrap hyphens-none ${className}`}
      >
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    );
  }

  if (text) {
    return (
      <div
        className={`rich-text-viewer space-y-3 ${
          invert ? "text-white/90" : "text-[var(--ink)]"
        } text-base md:text-lg leading-relaxed break-normal whitespace-pre-wrap hyphens-none ${className}`}
      >
        {text
          .split(/\n{2,}/)
          .map((block, idx) => (
            <p key={idx} className="m-0">{block}</p>
          ))}
      </div>
    );
  }

  return null;
}
