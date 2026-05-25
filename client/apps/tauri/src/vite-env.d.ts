/// <reference types="vite/client" />

import type { DetailedHTMLProps, HTMLAttributes } from "react";

type HyperframesPlayerAttributes = DetailedHTMLProps<
  HTMLAttributes<HTMLElement>,
  HTMLElement
> & {
  src?: string;
  srcdoc?: string;
  width?: number | string;
  height?: number | string;
  controls?: boolean | string;
  muted?: boolean | string;
  autoplay?: boolean | string;
  loop?: boolean | string;
  poster?: string;
  volume?: number | string;
  "playback-rate"?: number | string;
  "audio-src"?: string;
};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "hyperframes-player": HyperframesPlayerAttributes;
    }
  }
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "hyperframes-player": HyperframesPlayerAttributes;
    }
  }
}

declare module "react/jsx-runtime" {
  namespace JSX {
    interface IntrinsicElements {
      "hyperframes-player": HyperframesPlayerAttributes;
    }
  }
}

export {};
