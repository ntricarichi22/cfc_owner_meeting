/**
 * Redline helpers: word-level diffs for the UI, and a full-constitution
 * Word (.docx) export with real tracked changes + comments for each
 * amended section.
 */

import { diffBodies, type DiffPart } from "@/lib/diff";
import {
  AlignmentType,
  CommentRangeEnd,
  CommentRangeStart,
  CommentReference,
  Document,
  DeletedTextRun,
  HeadingLevel,
  InsertedTextRun,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

export { diffBodies, type DiffPart } from "@/lib/diff";

/* ------------------------------------------------------------------ *
 * Word export
 * ------------------------------------------------------------------ */

export interface RedlineSectionAmendment {
  /** Comment text explaining the change (proposal, vote, summary, notes). */
  commentLines: string[];
  recommended_body: string;
}

export interface RedlineSection {
  section_num: string | null;
  section_title: string | null;
  body: string;
  amendment: RedlineSectionAmendment | null;
}

export interface RedlineArticle {
  article_num: number | null;
  article_title: string | null;
  sections: RedlineSection[];
}

export interface RedlineDocInput {
  title: string;
  subtitle: string;
  articles: RedlineArticle[];
}

const TRACK_AUTHOR = "CFC Owners Meeting";

/**
 * Split diff parts into paragraphs (on newlines) while preserving run types.
 * Returns one array of parts per output paragraph.
 */
function partsToParagraphs(parts: DiffPart[]): DiffPart[][] {
  const paragraphs: DiffPart[][] = [[]];
  for (const part of parts) {
    const pieces = part.text.split("\n");
    pieces.forEach((piece, i) => {
      if (i > 0) paragraphs.push([]);
      if (piece) paragraphs[paragraphs.length - 1].push({ type: part.type, text: piece });
    });
  }
  return paragraphs.filter((p) => p.length > 0);
}

function plainParagraphs(body: string): Paragraph[] {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => new Paragraph({ children: [new TextRun(line)], spacing: { after: 120 } }));
}

/** Build the full-constitution redline as a .docx buffer. */
export async function buildRedlineDocx(input: RedlineDocInput): Promise<Buffer> {
  let revisionId = 1;
  const now = new Date();
  const isoDate = now.toISOString();

  const comments: { id: number; author: string; date: Date; children: Paragraph[] }[] = [];
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      children: [new TextRun({ text: input.title, bold: true, size: 40 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [new TextRun({ text: input.subtitle, italics: true, size: 22 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text:
            "Tracked changes below reflect the amendments approved at the owners meeting. " +
            "Each amended section carries a comment explaining the change. " +
            "Review in Microsoft Word and use Accept/Reject Changes to finalize.",
          size: 20,
          italics: true,
        }),
      ],
      spacing: { after: 360 },
    }),
  );

  for (const article of input.articles) {
    const articleLabel = [
      article.article_num != null ? `Article ${article.article_num}` : null,
      article.article_title,
    ]
      .filter(Boolean)
      .join(" — ");
    if (articleLabel) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: articleLabel })],
          spacing: { before: 360, after: 160 },
        }),
      );
    }

    for (const section of input.articles.length ? article.sections : []) {
      const sectionLabel = [
        section.section_num ? `Section ${section.section_num}` : null,
        section.section_title,
      ]
        .filter(Boolean)
        .join(" — ");

      const headingChildren: (TextRun | CommentRangeStart | CommentRangeEnd)[] = [];

      if (section.amendment) {
        const commentId = comments.length;
        comments.push({
          id: commentId,
          author: TRACK_AUTHOR,
          date: now,
          children: section.amendment.commentLines.map(
            (line) => new Paragraph({ children: [new TextRun(line)] }),
          ),
        });
        headingChildren.push(
          new CommentRangeStart(commentId),
          new TextRun({ text: sectionLabel || "Section" }),
          new CommentRangeEnd(commentId),
          new TextRun({ children: [new CommentReference(commentId)] }),
        );
      } else {
        headingChildren.push(new TextRun({ text: sectionLabel || "Section" }));
      }

      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: headingChildren,
          spacing: { before: 240, after: 120 },
        }),
      );

      if (!section.amendment) {
        children.push(...plainParagraphs(section.body));
        continue;
      }

      // Tracked-changes body: word-level diff between current and recommended.
      const parts = diffBodies(section.body, section.amendment.recommended_body);
      for (const paragraphParts of partsToParagraphs(parts)) {
        const runs = paragraphParts.map((part) => {
          if (part.type === "ins") {
            return new InsertedTextRun({
              text: part.text,
              id: revisionId++,
              author: TRACK_AUTHOR,
              date: isoDate,
            });
          }
          if (part.type === "del") {
            return new DeletedTextRun({
              text: part.text,
              id: revisionId++,
              author: TRACK_AUTHOR,
              date: isoDate,
            });
          }
          return new TextRun(part.text);
        });
        children.push(new Paragraph({ children: runs, spacing: { after: 120 } }));
      }
    }
  }

  const doc = new Document({
    comments: { children: comments },
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } },
      },
    },
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}
