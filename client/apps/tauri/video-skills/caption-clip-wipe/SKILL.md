---
name: caption-clip-wipe
type: hyperframes:component
source: https://hyperframes.mintlify.app/catalog/components/caption-clip-wipe
---

# Caption Clip Wipe

Use this component when the user asks for high-energy captions, TikTok-style
captions, word reveal subtitles, wipe captions, or kinetic subtitles.

The agent should request this component by returning:

```json
{
  "componentNames": ["caption-clip-wipe"]
}
```

## Inputs

- Caption words or short phrases with numeric `startSeconds` and `endSeconds`.
- Composition duration.
- Caption placement, usually lower third or bottom center.

## Native Wiring Contract

- Treat this as an inline HyperFrames component, not a standalone block.
- The host composition keeps the root `data-composition-id`.
- The component may contribute caption markup, scoped CSS, and synchronous GSAP
  timeline calls.
- OpenBrief validators must check all selected component names before preview
  or render.

## Rules

- Do not invent component names.
- Do not add network scripts or remote font dependencies from the model output.
- Do not use `Math.random`, `Date.now`, async timeline construction, or
  `repeat: -1`.
- Every word or phrase timing must be inside the composition duration.
- Do not animate video dimensions; animate caption spans or wrappers.
