import { Markdown } from "@tiptap/markdown";
import {
  EditorContent,
  Node,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type Editor,
  type ReactNodeViewProps,
  useEditor,
} from "@tiptap/react";
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
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Button } from "@acme/ui/button";
import { cn } from "@acme/ui";
import {
  createSummaryTimestampHref,
  parseSummaryTimestampHref,
  parseSummaryTimestampLabel,
} from "@/domain/summary";

type MarkdownSummaryEditorProps = {
  markdown: string;
  editable?: boolean;
  ariaLabel: string;
  className?: string;
  toolbarActions?: ReactNode;
  onMarkdownChange?(markdown: string): void;
  onTimestampClick?(seconds: number): void;
  onTimestampPreviewRequest?(
    seconds: number,
  ): Promise<SummaryTimestampPreview | undefined>;
};

export type SummaryTimestampPreview = {
  imageUrl: string;
  alt?: string;
};

type SummaryTimestampOptions = {
  onTimestampClick?: (seconds: number) => void;
  hasTimestampPreviewRequest?: () => boolean;
  onTimestampPreviewRequest?: (
    seconds: number,
  ) => Promise<SummaryTimestampPreview | undefined>;
};

const SummaryTimestampNode = Node.create<SummaryTimestampOptions>({
  name: "summaryTimestamp",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  priority: 1000,
  markdownTokenName: "link",

  addOptions() {
    return {};
  },

  addAttributes() {
    return {
      label: {
        default: "0:00",
      },
      seconds: {
        default: 0,
        parseHTML: (element) => {
          const value = element.getAttribute("data-seconds");
          const seconds = value ? Number(value) : 0;
          return Number.isInteger(seconds) && seconds >= 0 ? seconds : 0;
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-openbrief-timestamp]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const label =
      typeof node.attrs.label === "string" ? node.attrs.label : "0:00";
    const seconds =
      typeof node.attrs.seconds === "number" ? node.attrs.seconds : 0;

    return [
      "span",
      {
        ...HTMLAttributes,
        "data-openbrief-timestamp": label,
        "data-seconds": String(seconds),
      },
      label,
    ];
  },

  renderText({ node }) {
    return typeof node.attrs.label === "string" ? node.attrs.label : "";
  },

  parseMarkdown(token, helpers) {
    const seconds = parseSummaryTimestampHref(token.href);
    const label = markdownTokenPlainText(token).trim();
    if (
      seconds === undefined ||
      parseSummaryTimestampLabel(label) === undefined
    ) {
      return helpers.applyMark("link", helpers.parseInline(token.tokens || []), {
        href: token.href,
        title: token.title || null,
      });
    }

    return helpers.createNode("summaryTimestamp", { label, seconds });
  },

  renderMarkdown(node) {
    const label =
      typeof node.attrs?.label === "string" ? node.attrs.label : "0:00";
    const seconds =
      typeof node.attrs?.seconds === "number"
        ? node.attrs.seconds
        : parseSummaryTimestampLabel(label) ?? 0;

    return `[${label}](${createSummaryTimestampHref(seconds)})`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(SummaryTimestampNodeView, {
      as: "span",
      attrs: {
        class: "openbrief-timestamp-node-view",
      },
    });
  },
});

export function MarkdownSummaryEditor({
  markdown,
  editable = false,
  ariaLabel,
  className,
  toolbarActions,
  onMarkdownChange,
  onTimestampClick,
  onTimestampPreviewRequest,
}: MarkdownSummaryEditorProps) {
  const markdownRef = useRef(markdown);
  const onMarkdownChangeRef = useRef(onMarkdownChange);
  const onTimestampClickRef = useRef(onTimestampClick);
  const onTimestampPreviewRequestRef = useRef(onTimestampPreviewRequest);
  markdownRef.current = markdown;
  onMarkdownChangeRef.current = onMarkdownChange;
  onTimestampClickRef.current = onTimestampClick;
  onTimestampPreviewRequestRef.current = onTimestampPreviewRequest;
  const markdownExtensions = useMemo(
    () => [
      SummaryTimestampNode.configure({
        onTimestampClick: (seconds) => onTimestampClickRef.current?.(seconds),
        hasTimestampPreviewRequest: () =>
          Boolean(onTimestampPreviewRequestRef.current),
        onTimestampPreviewRequest: (seconds) =>
          onTimestampPreviewRequestRef.current?.(seconds) ??
          Promise.resolve(undefined),
      }),
      StarterKit,
      Markdown,
    ],
    [],
  );

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
        "flex min-h-full flex-col",
        className,
      )}
    >
      {editable || toolbarActions ? (
        <MarkdownEditorToolbar
          editor={editor}
          editable={editable}
          actions={toolbarActions}
        />
      ) : null}
      <div className={cn("min-h-0 flex-1 px-3", editable && "pt-3")}>
        <EditorContent
          editor={editor}
          onClickCapture={(event) =>
            handleTimestampLinkClick(event, onTimestampClick)
          }
        />
      </div>
    </div>
  );
}

function SummaryTimestampNodeView({
  node,
  editor,
  extension,
  deleteNode,
}: ReactNodeViewProps) {
  const label = typeof node.attrs.label === "string" ? node.attrs.label : "0:00";
  const seconds =
    typeof node.attrs.seconds === "number"
      ? node.attrs.seconds
      : parseSummaryTimestampLabel(label) ?? 0;
  const options = extension.options as SummaryTimestampOptions;
  const canPreview = options.hasTimestampPreviewRequest?.() ?? false;
  const [previewState, setPreviewState] = useState<TimestampPreviewState>({
    status: "idle",
  });
  const requestIdRef = useRef(0);
  const requestPreview = useCallback(() => {
    if (
      !canPreview ||
      !options.onTimestampPreviewRequest ||
      previewState.status === "loading" ||
      previewState.status === "ready"
    ) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setPreviewState({ status: "loading" });
    void options
      .onTimestampPreviewRequest(seconds)
      .then((preview) => {
        if (requestIdRef.current !== requestId) return;
        setPreviewState(
          preview
            ? {
                status: "ready",
                imageUrl: preview.imageUrl,
                alt: preview.alt,
              }
            : { status: "error" },
        );
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return;
        setPreviewState({ status: "error" });
      });
  }, [canPreview, options, previewState.status, seconds]);

  return (
    <NodeViewWrapper
      as="span"
      className="openbrief-timestamp-node"
      contentEditable={false}
      data-openbrief-timestamp={label}
      data-seconds={seconds}
      onMouseEnter={requestPreview}
      onFocusCapture={requestPreview}
    >
      <button
        type="button"
        className={cn(
          "openbrief-timestamp-node__seek",
          !editor.isEditable && "rounded-r",
        )}
        aria-label={`Seek to ${label}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.preventDefault();
          options.onTimestampClick?.(seconds);
        }}
      >
        {label}
      </button>
      {editor.isEditable ? (
        <button
          type="button"
          className="openbrief-timestamp-node__remove"
          aria-label={`Remove timestamp ${label}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.preventDefault();
            deleteNode();
          }}
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : null}
      {canPreview ? (
        <TimestampPreviewDialog label={label} state={previewState} />
      ) : null}
    </NodeViewWrapper>
  );
}

type TimestampPreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; imageUrl: string; alt?: string }
  | { status: "error" };

function TimestampPreviewDialog({
  label,
  state,
}: {
  label: string;
  state: TimestampPreviewState;
}) {
  return (
    <span
      className="openbrief-timestamp-node__preview"
      aria-live="polite"
      role={state.status === "loading" ? "status" : undefined}
    >
      {state.status === "ready" ? (
        <img
          className="openbrief-timestamp-node__preview-image"
          src={state.imageUrl}
          alt={state.alt ?? `Frame preview for ${label}`}
          draggable={false}
        />
      ) : state.status === "error" ? (
        <span>Frame unavailable</span>
      ) : state.status === "loading" ? (
        <span>Loading frame</span>
      ) : null}
    </span>
  );
}

function markdownTokenPlainText(token: {
  text?: unknown;
  tokens?: unknown;
}): string {
  if (typeof token.text === "string") return token.text;
  if (!Array.isArray(token.tokens)) return "";

  return token.tokens
    .map((child) =>
      typeof child === "object" && child !== null
        ? markdownTokenPlainText(child as { text?: unknown; tokens?: unknown })
        : "",
    )
    .join("");
}

function handleTimestampLinkClick(
  event: MouseEvent<HTMLDivElement>,
  onTimestampClick: ((seconds: number) => void) | undefined,
) {
  if (!onTimestampClick) return;

  const target = event.target;
  if (!(target instanceof Element)) return;

  const link = target.closest("a");
  if (!link || !event.currentTarget.contains(link)) return;

  const seconds = parseSummaryTimestampHref(link.getAttribute("href"));
  if (seconds === undefined) return;

  event.preventDefault();
  onTimestampClick(seconds);
}

function MarkdownEditorToolbar({
  editor,
  editable,
  actions,
}: {
  editor: Editor | null;
  editable: boolean;
  actions?: ReactNode;
}) {
  return (
    <div
      className="sticky top-0 z-10 flex flex-wrap items-center gap-1 rounded-t-md border-b border-border bg-muted px-2 py-1.5"
      aria-label="Markdown formatting toolbar"
    >
      {editable ? (
        <>
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
        </>
      ) : null}
      {actions ? (
        <div className="ml-auto flex items-center gap-1">
          {editable ? <ToolbarSeparator /> : null}
          {actions}
        </div>
      ) : null}
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
