import { getMarketingCopy } from "~/app/_lib/i18n";
import type { SupportedLocale } from "~/app/_lib/i18n";

const siteUrl = "https://openbrief.app";

/**
 * WebSite + SoftwareApplication JSON-LD for the home page. SoftwareApplication
 * (free, cross-platform desktop app) is eligible for rich results.
 */
export function HomeStructuredData({ locale }: { locale: SupportedLocale }) {
  const copy = getMarketingCopy(locale);

  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        name: "OpenBrief",
        url: siteUrl,
        inLanguage: locale,
        description: copy.footer.description,
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteUrl}/#app`,
        name: "OpenBrief",
        url: siteUrl,
        applicationCategory: "ProductivityApplication",
        operatingSystem: "macOS, Windows, Linux",
        description: copy.home.hero.secondary,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
