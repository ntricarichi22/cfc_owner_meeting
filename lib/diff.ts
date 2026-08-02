/** Client-safe word-level diff used by the redline UI and the Word export. */

import { diffWords } from "diff";

export interface DiffPart {
  type: "equal" | "ins" | "del";
  text: string;
}

export function diffBodies(current: string, recommended: string): DiffPart[] {
  return diffWords(current ?? "", recommended ?? "").map((part) => ({
    type: part.added ? "ins" : part.removed ? "del" : "equal",
    text: part.value,
  }));
}
