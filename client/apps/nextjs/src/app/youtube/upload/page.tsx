import Link from "next/link";

import { UploadForm } from "./upload-form";

export default function UploadPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">Upload your screenshot</h1>
        <p className="text-muted-foreground text-sm">
          Open YouTube → your profile → Time watched → Time management. Take a
          screenshot, then drop it here.
        </p>
      </header>
      <UploadForm />
      <p className="text-muted-foreground text-xs">
        After extraction, your stats appear on{" "}
        <Link href="/youtube/dashboard" className="underline">
          the dashboard
        </Link>
        .
      </p>
    </div>
  );
}
