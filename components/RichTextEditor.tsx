"use client";

import dynamic from "next/dynamic";
import { useMemo, useEffect, useState } from "react";
import "react-quill-new/dist/quill.snow.css";

const ReactQuill = dynamic(() => import("react-quill-new"), { ssr: false });

const FONT_FAMILIES = [
  "sans-serif",
  "serif",
  "monospace",
  "Arial",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Verdana",
  "Trebuchet MS",
];

const FONT_SIZES = [
  "10px", "12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px", "36px",
];

/* Register custom font and size whitelists with Quill */
let quillRegistered = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let QuillDelta: any = null;

async function registerQuillFormats() {
  if (quillRegistered) return;
  try {
    const { Quill } = await import("react-quill-new");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Font = Quill.import("formats/font") as any;
    Font.whitelist = FONT_FAMILIES;
    Quill.register(Font, true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Size = Quill.import("formats/size") as any;
    Size.whitelist = FONT_SIZES;
    Quill.register(Size, true);

    // Register a custom blot that stores raw table HTML so that
    // merged cells (colspan/rowspan) pasted from Google Sheets are preserved.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const BlockEmbed = Quill.import("blots/block/embed") as any;
    class TableHtmlBlot extends BlockEmbed {
      static blotName = "table-html";
      static tagName = "div";
      static className = "ql-html-table";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      static create(value: any) {
        const node = super.create() as HTMLElement;
        node.setAttribute("contenteditable", "false");
        node.innerHTML = typeof value === "string" ? value : "";
        return node;
      }

      static value(node: HTMLElement) {
        return node.innerHTML;
      }
    }
    Quill.register(TableHtmlBlot, true);

    QuillDelta = Quill.import("delta");

    quillRegistered = true;
  } catch {
    // ignore registration errors during SSR
  }
}

const TOOLBAR_OPTIONS = [
  [{ font: FONT_FAMILIES }],
  [{ size: FONT_SIZES }],
  [{ header: [1, 2, 3, false] }],
  ["bold", "italic", "underline"],
  [{ color: [] }, { background: [] }],
  [{ list: "ordered" }, { list: "bullet" }],
  ["clean"],
];

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const [ready, setReady] = useState(quillRegistered);

  useEffect(() => {
    if (!quillRegistered) {
      registerQuillFormats().then(() => setReady(true));
    }
  }, []);

  const modules = useMemo(
    () => ({
      toolbar: TOOLBAR_OPTIONS,
      clipboard: {
        // Preserve merged-cell tables (colspan/rowspan) pasted from
        // Google Sheets by storing the full table HTML as a raw embed
        // instead of letting Quill flatten it to its simplified Delta format.
        matchers: [
          [
            "table",
            (node: Element, delta: unknown) => {
              // QuillDelta is set during registerQuillFormats(); fall back to
              // the default delta if it hasn't been initialised yet.
              if (!QuillDelta) return delta;
              return new QuillDelta().insert({ "table-html": (node as HTMLElement).outerHTML });
            },
          ],
        ],
      },
    }),
    []
  );

  if (!ready) {
    return (
      <div className="rich-text-editor">
        <div className="rounded-lg border border-white/20 bg-white/5 min-h-[120px] px-3 py-2 text-sm text-white/30 italic">
          Loading editor...
        </div>
      </div>
    );
  }

  return (
    <div className="rich-text-editor">
      <ReactQuill
        theme="snow"
        value={value}
        onChange={onChange}
        modules={modules}
        placeholder={placeholder}
      />
      <style jsx global>{`
        .rich-text-editor .ql-toolbar.ql-snow {
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 0.5rem 0.5rem 0 0;
          background: rgba(255, 255, 255, 0.05);
        }
        .rich-text-editor .ql-container.ql-snow {
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-top: none;
          border-radius: 0 0 0.5rem 0.5rem;
          background: rgba(255, 255, 255, 0.05);
          min-height: 120px;
          font-size: 0.875rem;
          color: white;
        }
        .rich-text-editor .ql-editor {
          min-height: 120px;
          color: white;
        }
        .rich-text-editor .ql-editor.ql-blank::before {
          color: rgba(255, 255, 255, 0.3);
          font-style: italic;
        }
        .rich-text-editor .ql-toolbar .ql-stroke {
          stroke: rgba(255, 255, 255, 0.6);
        }
        .rich-text-editor .ql-toolbar .ql-fill {
          fill: rgba(255, 255, 255, 0.6);
        }
        .rich-text-editor .ql-toolbar .ql-picker-label {
          color: rgba(255, 255, 255, 0.6);
        }
        .rich-text-editor .ql-toolbar .ql-picker-options {
          background: #1a1a1a;
          border-color: rgba(255, 255, 255, 0.2);
        }
        .rich-text-editor .ql-toolbar .ql-picker-item {
          color: rgba(255, 255, 255, 0.8);
        }
        .rich-text-editor .ql-toolbar .ql-picker-item:hover {
          color: white;
        }
        .rich-text-editor .ql-toolbar button:hover .ql-stroke,
        .rich-text-editor .ql-toolbar .ql-active .ql-stroke {
          stroke: #0ea5e9;
        }
        .rich-text-editor .ql-toolbar button:hover .ql-fill,
        .rich-text-editor .ql-toolbar .ql-active .ql-fill {
          fill: #0ea5e9;
        }
        .rich-text-editor .ql-toolbar .ql-active .ql-picker-label {
          color: #0ea5e9;
        }
        /* Font family picker labels */
        .rich-text-editor .ql-snow .ql-picker.ql-font .ql-picker-label::before,
        .rich-text-editor .ql-snow .ql-picker.ql-font .ql-picker-item::before {
          content: 'Sans Serif';
        }
        .rich-text-editor .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="serif"]::before,
        .rich-text-editor .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="serif"]::before {
          content: 'Serif';
          font-family: serif;
        }
        .rich-text-editor .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="monospace"]::before,
        .rich-text-editor .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="monospace"]::before {
          content: 'Monospace';
          font-family: monospace;
        }
        .rich-text-editor .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="Arial"]::before,
        .rich-text-editor .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="Arial"]::before {
          content: 'Arial';
          font-family: Arial, sans-serif;
        }
        .rich-text-editor .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="Georgia"]::before,
        .rich-text-editor .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="Georgia"]::before {
          content: 'Georgia';
          font-family: Georgia, serif;
        }
        .rich-text-editor .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="Times New Roman"]::before,
        .rich-text-editor .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="Times New Roman"]::before {
          content: 'Times New Roman';
          font-family: "Times New Roman", serif;
        }
        .rich-text-editor .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="Courier New"]::before,
        .rich-text-editor .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="Courier New"]::before {
          content: 'Courier New';
          font-family: "Courier New", monospace;
        }
        .rich-text-editor .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="Verdana"]::before,
        .rich-text-editor .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="Verdana"]::before {
          content: 'Verdana';
          font-family: Verdana, sans-serif;
        }
        .rich-text-editor .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="Trebuchet MS"]::before,
        .rich-text-editor .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="Trebuchet MS"]::before {
          content: 'Trebuchet MS';
          font-family: "Trebuchet MS", sans-serif;
        }
        /* Font size picker labels */
        .rich-text-editor .ql-snow .ql-picker.ql-size .ql-picker-label::before,
        .rich-text-editor .ql-snow .ql-picker.ql-size .ql-picker-item::before {
          content: 'Size';
        }
        .rich-text-editor .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="10px"]::before,
        .rich-text-editor .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="10px"]::before {
          content: '10px';
        }
        .rich-text-editor .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="12px"]::before,
        .rich-text-editor .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="12px"]::before {
          content: '12px';
        }
        .rich-text-editor .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="14px"]::before,
        .rich-text-editor .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="14px"]::before {
          content: '14px';
        }
        .rich-text-editor .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="16px"]::before,
        .rich-text-editor .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="16px"]::before {
          content: '16px';
        }
        .rich-text-editor .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="18px"]::before,
        .rich-text-editor .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="18px"]::before {
          content: '18px';
        }
        .rich-text-editor .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="20px"]::before,
        .rich-text-editor .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="20px"]::before {
          content: '20px';
        }
        .rich-text-editor .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="24px"]::before,
        .rich-text-editor .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="24px"]::before {
          content: '24px';
        }
        .rich-text-editor .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="28px"]::before,
        .rich-text-editor .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="28px"]::before {
          content: '28px';
        }
        .rich-text-editor .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="32px"]::before,
        .rich-text-editor .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="32px"]::before {
          content: '32px';
        }
        .rich-text-editor .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="36px"]::before,
        .rich-text-editor .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="36px"]::before {
          content: '36px';
        }
        /* Header picker labels */
        .rich-text-editor .ql-snow .ql-picker.ql-header .ql-picker-label::before,
        .rich-text-editor .ql-snow .ql-picker.ql-header .ql-picker-item::before {
          content: 'Normal';
        }
        .rich-text-editor .ql-snow .ql-picker.ql-header .ql-picker-label[data-value="1"]::before,
        .rich-text-editor .ql-snow .ql-picker.ql-header .ql-picker-item[data-value="1"]::before {
          content: 'Heading 1';
        }
        .rich-text-editor .ql-snow .ql-picker.ql-header .ql-picker-label[data-value="2"]::before,
        .rich-text-editor .ql-snow .ql-picker.ql-header .ql-picker-item[data-value="2"]::before {
          content: 'Heading 2';
        }
        .rich-text-editor .ql-snow .ql-picker.ql-header .ql-picker-label[data-value="3"]::before,
        .rich-text-editor .ql-snow .ql-picker.ql-header .ql-picker-item[data-value="3"]::before {
          content: 'Heading 3';
        }
        /* Picker dropdown width adjustments */
        .rich-text-editor .ql-snow .ql-picker.ql-font {
          width: 130px;
        }
        .rich-text-editor .ql-snow .ql-picker.ql-size {
          width: 80px;
        }
      `}</style>
    </div>
  );
}
