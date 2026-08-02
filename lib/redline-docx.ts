/**
 * In-place tracked-changes redlining of an uploaded .docx.
 *
 * Takes the league's original constitution Word document and applies the
 * approved amendments directly into its XML as Word tracked changes
 * (w:ins / w:del), preserving ALL original formatting: untouched paragraphs
 * and runs are left byte-identical, and edits within a paragraph split runs
 * so unchanged text keeps its exact run formatting (bold terms, fonts, etc.).
 * Each amended passage also gets a Word comment explaining the change.
 */

import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { diffArrays, diffWords } from "diff";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const AUTHOR = "CFC Owners Meeting";

export interface DocxAmendment {
  /** Label used in warnings, e.g. "Art. 6 §4 Trades". */
  label: string;
  /** Current section text as stored in the app (plain text, \n paragraphs). */
  oldBody: string;
  /** Approved replacement text (plain text, \n paragraphs). */
  newBody: string;
  /** Comment lines explaining the change (proposal, vote, summary). */
  commentLines: string[];
}

export interface RedlineDocxResult {
  buffer: Buffer;
  applied: string[];
  warnings: string[];
}

/* ------------------------------------------------------------------ *
 * Small XML helpers
 * ------------------------------------------------------------------ */

type XmlDoc = ReturnType<DOMParser["parseFromString"]>;
type XmlElement = ReturnType<XmlDoc["createElementNS"]>;

function childElements(node: XmlElement, localName?: string): XmlElement[] {
  const out: XmlElement[] = [];
  const nodes = node.childNodes;
  for (let i = 0; i < nodes.length; i++) {
    const child = nodes.item(i) as XmlElement;
    if (child.nodeType !== 1) continue;
    if (!localName || (child as { localName?: string }).localName === localName) out.push(child);
  }
  return out;
}

function descendants(node: XmlElement, localName: string): XmlElement[] {
  const found = (node as { getElementsByTagNameNS?: (ns: string, name: string) => { length: number; item(i: number): unknown } })
    .getElementsByTagNameNS?.(W_NS, localName);
  const out: XmlElement[] = [];
  if (found) for (let i = 0; i < found.length; i++) out.push(found.item(i) as XmlElement);
  return out;
}

function textOf(el: XmlElement): string {
  return el.textContent ?? "";
}

function normalize(s: string): string {
  return s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

/* ------------------------------------------------------------------ *
 * Run slots: the editable text units of a paragraph
 * ------------------------------------------------------------------ */

interface RunSlot {
  r: XmlElement; // the w:r element
  t: XmlElement; // the w:t element inside it
  text: string;
}

/** Collect the text runs of a paragraph (w:r elements containing one w:t). */
function collectSlots(p: XmlElement): RunSlot[] {
  const slots: RunSlot[] = [];
  for (const r of descendants(p, "r")) {
    // Skip runs already inside ins/del (shouldn't happen on clean docs).
    const parentName = (r.parentNode as { localName?: string } | null)?.localName;
    if (parentName === "ins" || parentName === "del") continue;
    for (const t of childElements(r, "t")) {
      slots.push({ r, t, text: textOf(t) });
    }
  }
  return slots;
}

function slotsText(slots: RunSlot[]): string {
  return slots.map((s) => s.text).join("");
}

function setText(doc: XmlDoc, t: XmlElement, text: string) {
  while (t.firstChild) t.removeChild(t.firstChild);
  t.appendChild(doc.createTextNode(text));
  if (text !== text.trim()) t.setAttribute("xml:space", "preserve");
}

/**
 * Ensure a slot boundary exists at global char offset `offset`.
 * Splits the containing run into two runs when the offset falls mid-slot.
 */
function splitAt(doc: XmlDoc, slots: RunSlot[], offset: number): void {
  let acc = 0;
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const end = acc + slot.text.length;
    if (offset <= acc) return;
    if (offset < end) {
      const k = offset - acc;
      const before = slot.text.slice(0, k);
      const after = slot.text.slice(k);
      // Clone the run for the second half so formatting is identical.
      const clone = slot.r.cloneNode(true) as XmlElement;
      slot.r.parentNode?.insertBefore(clone, slot.r.nextSibling);
      setText(doc, slot.t, before);
      slot.text = before;
      const cloneT = childElements(clone, "t")[0];
      if (cloneT) setText(doc, cloneT, after);
      slots.splice(i + 1, 0, { r: clone, t: cloneT ?? slot.t, text: after });
      return;
    }
    acc = end;
  }
}

/** Find the slot index that starts at global offset (after splitting). */
function slotIndexAt(slots: RunSlot[], offset: number): number {
  let acc = 0;
  for (let i = 0; i < slots.length; i++) {
    if (acc === offset) return i;
    acc += slots[i].text.length;
  }
  return slots.length;
}

let revisionCounter = 1000;

function makeTrackAttrs(doc: XmlDoc, el: XmlElement) {
  el.setAttribute("w:id", String(revisionCounter++));
  el.setAttribute("w:author", AUTHOR);
  el.setAttribute("w:date", new Date().toISOString());
}

/** Wrap the given consecutive run slots in a single w:del (converting w:t → w:delText). */
function wrapDeleted(doc: XmlDoc, slots: RunSlot[]): XmlElement | null {
  if (slots.length === 0) return null;
  const del = doc.createElementNS(W_NS, "w:del");
  makeTrackAttrs(doc, del);
  const first = slots[0].r;
  first.parentNode?.insertBefore(del, first);
  for (const slot of slots) {
    del.appendChild(slot.r);
    const delText = doc.createElementNS(W_NS, "w:delText");
    const txt = textOf(slot.t);
    while (delText.firstChild) delText.removeChild(delText.firstChild);
    delText.appendChild(doc.createTextNode(txt));
    if (txt !== txt.trim()) delText.setAttribute("xml:space", "preserve");
    slot.t.parentNode?.replaceChild(delText, slot.t);
  }
  return del;
}

/** Build a w:ins containing one run with the given text, cloning rPr from a template run. */
function makeInserted(doc: XmlDoc, text: string, templateRun: XmlElement | null): XmlElement {
  const ins = doc.createElementNS(W_NS, "w:ins");
  makeTrackAttrs(doc, ins);
  const r = doc.createElementNS(W_NS, "w:r");
  if (templateRun) {
    const rPr = childElements(templateRun, "rPr")[0];
    if (rPr) r.appendChild(rPr.cloneNode(true));
  }
  const t = doc.createElementNS(W_NS, "w:t");
  t.appendChild(doc.createTextNode(text));
  t.setAttribute("xml:space", "preserve");
  r.appendChild(t);
  ins.appendChild(r);
  return ins;
}

/* ------------------------------------------------------------------ *
 * Paragraph-level operations
 * ------------------------------------------------------------------ */

/** Apply a word-level tracked edit inside one paragraph. */
function redlineParagraph(doc: XmlDoc, p: XmlElement, newText: string): void {
  const slots = collectSlots(p);
  const oldText = slotsText(slots);
  const parts = diffWords(oldText, newText);

  let pos = 0; // offset in oldText
  for (const part of parts) {
    if (part.added) {
      splitAt(doc, slots, pos);
      const idx = slotIndexAt(slots, pos);
      const template = slots[Math.min(idx, slots.length - 1)]?.r ?? slots[slots.length - 1]?.r ?? null;
      const ins = makeInserted(doc, part.value, template);
      if (idx < slots.length) {
        slots[idx].r.parentNode?.insertBefore(ins, slots[idx].r);
      } else if (slots.length > 0) {
        const last = slots[slots.length - 1].r;
        last.parentNode?.insertBefore(ins, last.nextSibling);
      } else {
        p.appendChild(ins);
      }
    } else if (part.removed) {
      splitAt(doc, slots, pos);
      splitAt(doc, slots, pos + part.value.length);
      const from = slotIndexAt(slots, pos);
      const to = slotIndexAt(slots, pos + part.value.length);
      wrapDeleted(doc, slots.slice(from, to));
      pos += part.value.length;
    } else {
      pos += part.value.length;
    }
  }
}

/** Mark an entire paragraph's text as deleted. */
function deleteParagraph(doc: XmlDoc, p: XmlElement): void {
  wrapDeleted(doc, collectSlots(p));
}

/** Insert a new paragraph (all-inserted) after `anchor`, copying its pPr and run formatting. */
function insertParagraphAfter(doc: XmlDoc, anchor: XmlElement, text: string): XmlElement {
  const p = doc.createElementNS(W_NS, "w:p");
  const anchorPPr = childElements(anchor, "pPr")[0];
  if (anchorPPr) p.appendChild(anchorPPr.cloneNode(true));
  const templateRun = descendants(anchor, "r")[0] ?? null;
  p.appendChild(makeInserted(doc, text, templateRun));
  anchor.parentNode?.insertBefore(p, anchor.nextSibling);
  return p;
}

/* ------------------------------------------------------------------ *
 * Comments plumbing
 * ------------------------------------------------------------------ */

interface CommentPlan {
  id: number;
  lines: string[];
}

function annotateWithComment(doc: XmlDoc, p: XmlElement, commentId: number): void {
  const start = doc.createElementNS(W_NS, "w:commentRangeStart");
  start.setAttribute("w:id", String(commentId));
  const end = doc.createElementNS(W_NS, "w:commentRangeEnd");
  end.setAttribute("w:id", String(commentId));
  const refRun = doc.createElementNS(W_NS, "w:r");
  const ref = doc.createElementNS(W_NS, "w:commentReference");
  ref.setAttribute("w:id", String(commentId));
  refRun.appendChild(ref);

  // Range: the whole paragraph content.
  const firstChild = childElements(p).find((c) => (c as { localName?: string }).localName !== "pPr");
  if (firstChild) p.insertBefore(start, firstChild);
  else p.appendChild(start);
  p.appendChild(end);
  p.appendChild(refRun);
}

function buildCommentsXml(comments: CommentPlan[]): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const now = new Date().toISOString();
  const body = comments
    .map((c) => {
      const paras = c.lines
        .map(
          (line) =>
            `<w:p><w:r><w:t xml:space="preserve">${esc(line)}</w:t></w:r></w:p>`,
        )
        .join("");
      return `<w:comment w:id="${c.id}" w:author="${esc(AUTHOR)}" w:date="${now}" w:initials="CFC">${paras}</w:comment>`;
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:comments xmlns:w="${W_NS}">${body}</w:comments>`
  );
}

async function ensureCommentsPart(zip: JSZip, commentsXml: string): Promise<void> {
  zip.file("word/comments.xml", commentsXml);

  // [Content_Types].xml override
  const ctPath = "[Content_Types].xml";
  const ct = await zip.file(ctPath)!.async("string");
  if (!ct.includes("/word/comments.xml")) {
    const override =
      `<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>`;
    zip.file(ctPath, ct.replace("</Types>", `${override}</Types>`));
  }

  // document.xml.rels relationship
  const relsPath = "word/_rels/document.xml.rels";
  const relsFile = zip.file(relsPath);
  let rels = relsFile
    ? await relsFile.async("string")
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
  if (!rels.includes('Target="comments.xml"')) {
    // Find an unused rId.
    let n = 1000;
    while (rels.includes(`Id="rId${n}"`)) n++;
    const rel = `<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>`;
    rels = rels.replace("</Relationships>", `${rel}</Relationships>`);
    zip.file(relsPath, rels);
  }
}

/* ------------------------------------------------------------------ *
 * Main entry
 * ------------------------------------------------------------------ */

export async function applyTrackedChangesToDocx(
  input: Buffer,
  amendments: DocxAmendment[],
): Promise<RedlineDocxResult> {
  const zip = await JSZip.loadAsync(input);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("Not a valid .docx file (missing word/document.xml)");
  const xml = await docFile.async("string");
  const doc = new DOMParser().parseFromString(xml, "text/xml");

  const body = descendants(doc.documentElement as unknown as XmlElement, "body")[0];
  if (!body) throw new Error("Not a valid .docx file (missing w:body)");

  // All paragraphs in document order with their normalized text.
  const allParas = descendants(body, "p");
  const paraTexts = allParas.map((p) => normalize(slotsText(collectSlots(p))));

  const applied: string[] = [];
  const warnings: string[] = [];
  const comments: CommentPlan[] = [];
  let commentId = 1;

  for (const amendment of amendments) {
    const oldParas = amendment.oldBody
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const newParas = amendment.newBody
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (oldParas.length === 0 || newParas.length === 0) {
      warnings.push(`${amendment.label}: nothing to apply (missing text).`);
      continue;
    }

    // Locate the contiguous range of document paragraphs matching oldParas.
    const normOld = oldParas.map(normalize);
    let startIdx = -1;
    for (let i = 0; i < paraTexts.length; i++) {
      if (paraTexts[i] !== normOld[0]) continue;
      let ok = true;
      let j = i;
      for (const want of normOld) {
        // Allow empty paragraphs between matched ones.
        while (j < paraTexts.length && paraTexts[j] === "" && want !== "") j++;
        if (j >= paraTexts.length || paraTexts[j] !== want) {
          ok = false;
          break;
        }
        j++;
      }
      if (ok) {
        startIdx = i;
        break;
      }
    }
    if (startIdx === -1) {
      warnings.push(
        `${amendment.label}: could not find this section's current text in the document — section skipped. (The doc may differ from the text stored in the app.)`,
      );
      continue;
    }

    // Collect the actual paragraph elements for the matched range.
    const matched: XmlElement[] = [];
    {
      let j = startIdx;
      for (const want of normOld) {
        while (paraTexts[j] === "" && want !== "") j++;
        matched.push(allParas[j]);
        j++;
      }
    }

    // Paragraph-level diff (old ↔ new), pairing replacements for word-level edits.
    const diff = diffArrays(normOld, newParas.map(normalize));
    let oldPtr = 0;
    const newTextByNorm = new Map(newParas.map((p) => [normalize(p), p]));
    let pendingRemoved: XmlElement[] = [];
    let pendingAdded: string[] = [];
    let lastTouched: XmlElement = matched[0];

    const flushPending = () => {
      const pairs = Math.min(pendingRemoved.length, pendingAdded.length);
      for (let k = 0; k < pairs; k++) {
        redlineParagraph(doc, pendingRemoved[k], pendingAdded[k]);
        lastTouched = pendingRemoved[k];
      }
      for (let k = pairs; k < pendingRemoved.length; k++) {
        deleteParagraph(doc, pendingRemoved[k]);
        lastTouched = pendingRemoved[k];
      }
      for (let k = pairs; k < pendingAdded.length; k++) {
        lastTouched = insertParagraphAfter(doc, lastTouched, pendingAdded[k]);
      }
      pendingRemoved = [];
      pendingAdded = [];
    };

    for (const part of diff) {
      if (part.removed) {
        for (const norm of part.value) {
          pendingRemoved.push(matched[oldPtr]);
          oldPtr++;
          void norm;
        }
      } else if (part.added) {
        for (const norm of part.value) {
          pendingAdded.push(newTextByNorm.get(norm) ?? norm);
        }
      } else {
        flushPending();
        for (const norm of part.value) {
          lastTouched = matched[oldPtr];
          oldPtr++;
          void norm;
        }
      }
    }
    flushPending();

    // Comment on the first matched paragraph.
    comments.push({ id: commentId, lines: amendment.commentLines });
    annotateWithComment(doc, matched[0], commentId);
    commentId++;

    applied.push(amendment.label);
  }

  if (comments.length > 0) {
    await ensureCommentsPart(zip, buildCommentsXml(comments));
  }

  zip.file("word/document.xml", new XMLSerializer().serializeToString(doc));
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { buffer: Buffer.from(buffer), applied, warnings };
}
