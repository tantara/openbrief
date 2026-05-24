import { and, eq, gt } from "@acme/db";
import { db } from "@acme/db/client";
import { shareSession } from "@acme/db/schema";
import { Button } from "@acme/ui/button";

export default async function SharePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [share] = await db
    .select()
    .from(shareSession)
    .where(
      and(eq(shareSession.slug, slug), gt(shareSession.expiresAt, new Date())),
    )
    .limit(1)
    .catch(() => []);
  const preview = share
    ? {
        asset: share.manifest.asset,
        artifactCount: share.manifest.artifacts.length,
      }
    : null;

  return (
    <main className="bg-background min-h-screen px-5 py-16">
      <section className="mx-auto flex max-w-xl flex-col gap-5">
        <p className="text-muted-foreground text-sm font-medium">
          OpenBrief share
        </p>
        <h1 className="text-4xl font-semibold tracking-normal">
          {preview?.asset.title ?? "This share is unavailable"}
        </h1>
        {share && preview ? (
          <>
            <p className="text-muted-foreground leading-7">
              Open this link in the OpenBrief mobile app to import{" "}
              {preview.artifactCount} selected artifacts. The gateway only
              coordinates pairing and does not store the artifact files.
            </p>
            <div className="bg-card rounded-md border p-4 text-sm">
              <p>Asset type: {preview.asset.sourceType}</p>
              <p>Expires: {share.expiresAt.toLocaleString()}</p>
              <p>Password required: {share.passwordHash ? "Yes" : "No"}</p>
            </div>
            <Button asChild>
              <a href={`openbrief://share/${slug}`}>Open in OpenBrief</a>
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground leading-7">
            The share may have expired or been revoked by the sender.
          </p>
        )}
      </section>
    </main>
  );
}
