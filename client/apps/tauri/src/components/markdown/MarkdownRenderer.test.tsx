import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownRenderer } from "@/components/markdown/MarkdownRenderer";

describe("MarkdownRenderer", () => {
  it("renders common markdown as static React content", () => {
    const { container } = render(
      <MarkdownRenderer
        markdown={[
          "# Heading",
          "",
          "Paragraph with **bold**, *italic*, `code`, and [a link](https://example.com).",
          "",
          "- First item",
          "- Second item",
          "",
          "> Quoted text",
          "",
          "```",
          "const value = 1;",
          "```",
        ].join("\n")}
      />,
    );

    expect(screen.getByRole("heading", { name: "Heading" }))
      .toBeInTheDocument();
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("italic").tagName).toBe("EM");
    expect(screen.getByText("code").tagName).toBe("CODE");
    expect(screen.getByRole("link", { name: "a link" }))
      .toHaveAttribute("href", "https://example.com");
    expect(screen.getByText("First item").closest("li")).toBeInTheDocument();
    expect(screen.getByText("Quoted text").closest("blockquote"))
      .toBeInTheDocument();
    expect(container.querySelector("pre code"))
      .toHaveTextContent("const value = 1;");
    expect(container.querySelector(".ProseMirror")).not.toBeInTheDocument();
  });

  it("does not render unsafe link protocols as anchors", () => {
    render(<MarkdownRenderer markdown="[bad](javascript:alert(1))" />);

    expect(screen.getByText("bad")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "bad" })).not.toBeInTheDocument();
  });
});
