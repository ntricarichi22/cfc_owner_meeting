"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import "react-quill-new/dist/quill.snow.css";

const ReactQuill = dynamic(() => import("react-quill-new"), { ssr: false });

const TOOLBAR_OPTIONS = [
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
  const modules = useMemo(
    () => ({
      toolbar: TOOLBAR_OPTIONS,
    }),
    []
  );

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
      `}</style>
    </div>
  );
}
