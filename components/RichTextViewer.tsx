"use client";

import DOMPurify from "isomorphic-dompurify";
import { useMemo } from "react";

interface RichTextViewerProps {
  html?: string | null;
  text?: string | null;
  items?: string[];
  className?: string;
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

export default function RichTextViewer({ html, text, items, className = "" }: RichTextViewerProps) {
  const sanitizedHtml = useMemo(() => {
    if (!html) return null;
    const safe = DOMPurify.sanitize(html);
    return transformNumberedParagraphs(safe);
  }, [html]);

  if (sanitizedHtml) {
    return (
      <div
        className={`rich-text-viewer prose prose-invert prose-sm md:prose-base max-w-none break-normal whitespace-pre-wrap hyphens-none text-white/90 leading-relaxed ${className}`}
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    );
  }

  if (items && items.length > 0) {
    return (
      <ul className={`rich-text-viewer list-disc list-inside space-y-2 text-white/90 text-base md:text-lg leading-relaxed break-normal whitespace-pre-wrap hyphens-none ${className}`}>
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    );
  }

  if (text) {
    return (
      <div className={`rich-text-viewer space-y-3 text-white/90 text-base md:text-lg leading-relaxed break-normal whitespace-pre-wrap hyphens-none ${className}`}>
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
