import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";
import { cn } from "@acme/ui";

type MarkdownRendererProps = {
  markdown: string;
  className?: string;
  ariaLabel?: string;
};

const markdownRendererExtensions = [StarterKit, Markdown];

export function MarkdownRenderer({
  markdown,
  className,
  ariaLabel,
}: MarkdownRendererProps) {
  const editor = useEditor({
    extensions: markdownRendererExtensions,
    content: markdown,
    contentType: "markdown",
    editable: false,
    editorProps: {
      attributes: {
        class: cn("openbrief-chat-markdown outline-none", className),
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
      },
    },
  });

  useEffect(() => {
    if (!editor || editor.getMarkdown() === markdown) return;

    editor.commands.setContent(markdown, {
      contentType: "markdown",
      emitUpdate: false,
    });
  }, [editor, markdown]);

  return <EditorContent editor={editor} />;
}
