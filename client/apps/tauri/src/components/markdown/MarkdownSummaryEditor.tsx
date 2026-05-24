import { Markdown } from "@tiptap/markdown";
import { EditorContent, type Editor, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@acme/ui/button";
import { cn } from "@acme/ui";

type MarkdownSummaryEditorProps = {
  markdown: string;
  editable?: boolean;
  ariaLabel: string;
  className?: string;
  onMarkdownChange?(markdown: string): void;
};

const markdownExtensions = [StarterKit, Markdown];

export function MarkdownSummaryEditor({
  markdown,
  editable = false,
  ariaLabel,
  className,
  onMarkdownChange,
}: MarkdownSummaryEditorProps) {
  const markdownRef = useRef(markdown);
  const onMarkdownChangeRef = useRef(onMarkdownChange);
  markdownRef.current = markdown;
  onMarkdownChangeRef.current = onMarkdownChange;

  const editor = useEditor({
    extensions: markdownExtensions,
    content: markdown,
    contentType: "markdown",
    editable,
    editorProps: {
      attributes: {
        "aria-label": ariaLabel,
        class: cn(
          "openbrief-markdown-editor min-h-full text-sm leading-relaxed outline-none",
          editable && "cursor-text",
        ),
        spellcheck: "true",
      },
    },
    onUpdate({ editor }) {
      const nextMarkdown = editor.getMarkdown();
      if (nextMarkdown !== markdownRef.current) {
        onMarkdownChangeRef.current?.(nextMarkdown);
      }
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editable, editor]);

  useEffect(() => {
    if (!editor || editor.getMarkdown() === markdown) return;

    editor.commands.setContent(markdown, {
      contentType: "markdown",
      emitUpdate: false,
    });
  }, [editor, markdown]);

  return (
    <div
      className={cn(
        "flex min-h-full flex-col overflow-hidden rounded-md",
        className,
      )}
    >
      {editable ? <MarkdownEditorToolbar editor={editor} /> : null}
      <div className="min-h-0 flex-1 px-4 py-3">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function MarkdownEditorToolbar({ editor }: { editor: Editor | null }) {
  return (
    <div
      className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/30 px-2 py-1.5"
      aria-label="Markdown formatting toolbar"
    >
      <ToolbarButton
        label="Undo"
        disabled={!editor?.can().chain().focus().undo().run()}
        onCommand={() => editor?.chain().focus().undo().run()}
      >
        <Undo2 className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Redo"
        disabled={!editor?.can().chain().focus().redo().run()}
        onCommand={() => editor?.chain().focus().redo().run()}
      >
        <Redo2 className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarSeparator />
      <ToolbarButton
        label="Heading 1"
        pressed={editor?.isActive("heading", { level: 1 })}
        onCommand={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Heading 2"
        pressed={editor?.isActive("heading", { level: 2 })}
        onCommand={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Heading 3"
        pressed={editor?.isActive("heading", { level: 3 })}
        onCommand={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarSeparator />
      <ToolbarButton
        label="Bold"
        pressed={editor?.isActive("bold")}
        onCommand={() => editor?.chain().focus().toggleBold().run()}
      >
        <Bold className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        pressed={editor?.isActive("italic")}
        onCommand={() => editor?.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Inline code"
        pressed={editor?.isActive("code")}
        onCommand={() => editor?.chain().focus().toggleCode().run()}
      >
        <Code2 className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarSeparator />
      <ToolbarButton
        label="Bullet list"
        pressed={editor?.isActive("bulletList")}
        onCommand={() => editor?.chain().focus().toggleBulletList().run()}
      >
        <List className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        pressed={editor?.isActive("orderedList")}
        onCommand={() => editor?.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Quote"
        pressed={editor?.isActive("blockquote")}
        onCommand={() => editor?.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="h-4 w-4" aria-hidden="true" />
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({
  label,
  pressed = false,
  disabled = false,
  onCommand,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onCommand(): void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={pressed ? "secondary" : "ghost"}
      size="icon"
      className="h-8 w-8"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault();
        if (!disabled) {
          onCommand();
        }
      }}
    >
      {children}
    </Button>
  );
}

function ToolbarSeparator() {
  return <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />;
}
