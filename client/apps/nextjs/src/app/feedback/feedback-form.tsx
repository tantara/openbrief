"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";

import { useTRPC } from "~/trpc/react";

type Kind = "feature" | "bug";

const BUG_TEMPLATE = `What happened
-

What I expected
-

Steps to reproduce
1.
2.
3.

Environment (OS, browser, app version)
- `;

const FEATURE_TEMPLATE = `Problem
- What are you trying to do today, and what is in the way?

Proposed solution
-

Alternatives you considered
- `;

export function FeedbackForm(props: { defaultEmail: string }) {
  const trpc = useTRPC();
  const [kind, setKind] = useState<Kind>("bug");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState(BUG_TEMPLATE);
  const [bodyTouched, setBodyTouched] = useState(false);
  const [email, setEmail] = useState(props.defaultEmail);

  const submit = useMutation(trpc.feedback.submit.mutationOptions());

  function switchKind(next: Kind) {
    setKind(next);
    if (!bodyTouched) {
      setBody(next === "bug" ? BUG_TEMPLATE : FEATURE_TEMPLATE);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit.mutate({
      kind,
      title: title.trim(),
      body: body.trim(),
      email: email.trim() || undefined,
    });
  }

  if (submit.isSuccess) {
    return (
      <div className="border-border bg-card flex flex-col gap-3 rounded-lg border p-6">
        <h2 className="text-xl font-semibold">Thanks — we got it</h2>
        <p className="text-muted-foreground text-sm">
          We read every submission. If you left an email and the report needs a
          follow-up, we will reach out.
        </p>
        <div>
          <Button
            variant="outline"
            onClick={() => {
              submit.reset();
              setTitle("");
              setBody(kind === "bug" ? BUG_TEMPLATE : FEATURE_TEMPLATE);
              setBodyTouched(false);
            }}
          >
            Send another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="border-border bg-card flex flex-col gap-5 rounded-lg border p-6"
    >
      <div className="flex flex-col gap-2">
        <Label>Type</Label>
        <div
          role="radiogroup"
          aria-label="Feedback type"
          className="grid grid-cols-2 gap-2"
        >
          <KindButton
            label="🐞 Bug report"
            active={kind === "bug"}
            onClick={() => switchKind("bug")}
          />
          <KindButton
            label="💡 Feature request"
            active={kind === "feature"}
            onClick={() => switchKind("feature")}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            kind === "bug"
              ? "One line: what is broken"
              : "One line: what should the app do"
          }
          maxLength={200}
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="body">Details</Label>
        <textarea
          id="body"
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setBodyTouched(true);
          }}
          rows={12}
          required
          minLength={10}
          maxLength={8000}
          className={cn(
            "border-input bg-background ring-offset-background placeholder:text-muted-foreground",
            "focus-visible:ring-ring rounded-md border px-3 py-2 text-sm",
            "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            "font-mono",
          )}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email (optional)</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="So we can follow up"
          maxLength={320}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={submit.isPending}>
          {submit.isPending ? "Sending…" : "Send feedback"}
        </Button>
        {submit.isError && (
          <p className="text-destructive text-sm">
            {submit.error.message || "Submit failed"}
          </p>
        )}
      </div>
    </form>
  );
}

function KindButton(props: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={props.active}
      onClick={props.onClick}
      className={cn(
        "border-border rounded-md border px-3 py-2 text-sm font-medium transition-colors",
        props.active
          ? "border-foreground bg-foreground/5"
          : "hover:bg-muted",
      )}
    >
      {props.label}
    </button>
  );
}
