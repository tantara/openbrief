import { Markdown, MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { Fragment, memo, useMemo, type ReactNode } from "react";
import { cn } from "@acme/ui";

type MarkdownRendererProps = {
  markdown: string;
  className?: string;
  ariaLabel?: string;
};

const markdownRendererExtensions = [StarterKit, Markdown];
const markdownManager = new MarkdownManager({
  extensions: markdownRendererExtensions,
});

type MarkdownMark = {
  type?: string;
  attrs?: Record<string, unknown>;
};

type MarkdownNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: MarkdownNode[];
  marks?: MarkdownMark[];
};

export const MarkdownRenderer = memo(function MarkdownRenderer({
  markdown,
  className,
  ariaLabel,
}: MarkdownRendererProps) {
  const content = useMemo(
    () =>
      renderMarkdownNode(markdownManager.parse(markdown) as MarkdownNode, "root"),
    [markdown],
  );

  return (
    <div
      className={cn("openbrief-chat-markdown outline-none", className)}
      {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
    >
      {content}
    </div>
  );
});

function renderMarkdownNode(node: MarkdownNode, key: string): ReactNode {
  const children = renderMarkdownChildren(node.content, key);

  switch (node.type) {
    case "doc":
      return <Fragment key={key}>{children}</Fragment>;
    case "paragraph":
      return <p key={key}>{children}</p>;
    case "text":
      return renderMarkedText(node, key);
    case "heading":
      return renderHeading(node, key, children);
    case "bulletList":
      return <ul key={key}>{children}</ul>;
    case "orderedList":
      return (
        <ol key={key} start={getNumberAttr(node, "start")}>
          {children}
        </ol>
      );
    case "listItem":
      return <li key={key}>{children}</li>;
    case "blockquote":
      return <blockquote key={key}>{children}</blockquote>;
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{collectPlainText(node)}</code>
        </pre>
      );
    case "horizontalRule":
      return <hr key={key} />;
    case "hardBreak":
      return <br key={key} />;
    default:
      return node.text ? (
        renderMarkedText(node, key)
      ) : (
        <Fragment key={key}>{children}</Fragment>
      );
  }
}

function renderMarkdownChildren(
  children: MarkdownNode[] | undefined,
  parentKey: string,
) {
  return children?.map((child, index) =>
    renderMarkdownNode(child, `${parentKey}-${index}`),
  );
}

function renderHeading(
  node: MarkdownNode,
  key: string,
  children: ReactNode,
) {
  const level = Math.min(Math.max(getNumberAttr(node, "level") ?? 1, 1), 6);

  switch (level) {
    case 1:
      return <h1 key={key}>{children}</h1>;
    case 2:
      return <h2 key={key}>{children}</h2>;
    case 3:
      return <h3 key={key}>{children}</h3>;
    case 4:
      return <h4 key={key}>{children}</h4>;
    case 5:
      return <h5 key={key}>{children}</h5>;
    default:
      return <h6 key={key}>{children}</h6>;
  }
}

function renderMarkedText(node: MarkdownNode, key: string) {
  return (node.marks ?? []).reduce<ReactNode>((content, mark, index) => {
    const markKey = `${key}-mark-${index}`;

    switch (mark.type) {
      case "bold":
        return <strong key={markKey}>{content}</strong>;
      case "italic":
        return <em key={markKey}>{content}</em>;
      case "strike":
        return <s key={markKey}>{content}</s>;
      case "code":
        return <code key={markKey}>{content}</code>;
      case "link": {
        const href = getSafeHref(mark.attrs?.href);
        return href ? (
          <a key={markKey} href={href} rel="noreferrer">
            {content}
          </a>
        ) : (
          content
        );
      }
      default:
        return content;
    }
  }, node.text ?? "");
}

function collectPlainText(node: MarkdownNode): string {
  if (node.text) return node.text;
  if (!node.content) return "";

  return node.content.map(collectPlainText).join("");
}

function getNumberAttr(node: MarkdownNode, name: string) {
  const value = node.attrs?.[name];
  return typeof value === "number" ? value : undefined;
}

function getSafeHref(href: unknown) {
  if (typeof href !== "string") return undefined;
  if (/^(https?:|mailto:)/i.test(href) || href.startsWith("#")) return href;
  return undefined;
}
