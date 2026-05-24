export type ReadableVoiceAudioFileNameRequest = {
  text?: string;
  voiceName?: string;
  shortId?: string;
  fallbackStem?: string;
};

export function createReadableVoiceAudioFileName({
  text,
  voiceName,
  shortId,
  fallbackStem = "voice-message",
}: ReadableVoiceAudioFileNameRequest) {
  const textStem = sanitizeVoiceFileNamePart(text ?? "", 20);
  const voiceStem = sanitizeVoiceFileNamePart(voiceName ?? "");
  const idStem = sanitizeVoiceFileNamePart(shortId ?? "", 8);
  const fallback =
    sanitizeVoiceFileNamePart(fallbackStem, 32) || "voice-message";
  const stem = [textStem, voiceStem, idStem].filter(Boolean).join("_");

  return `${stem || fallback}.wav`;
}

export function createShortVoiceAudioId(
  value: string | undefined,
  fallbackDate = new Date(),
) {
  const fallback = fallbackDate.getTime().toString(36).slice(-6);
  const source = value?.trim();

  if (!source) {
    return fallback;
  }

  const pathParts = source.split(/[\\/]/).filter(Boolean);
  const fileStem = pathParts
    .at(-1)
    ?.replace(/\.[A-Za-z0-9]+$/, "")
    .trim();
  const candidateStem =
    fileStem && /^(audio|voice|preview)$/i.test(fileStem)
      ? pathParts.at(-2)
      : fileStem;
  const stem = candidateStem?.replace(/^voice-message-/, "").trim();

  if (!stem) {
    return fallback;
  }

  if (/^\d+$/.test(stem)) {
    return BigInt(stem).toString(36).slice(-6);
  }

  return sanitizeVoiceFileNamePart(stem, 8) || fallback;
}

export function sanitizeVoiceFileNamePart(value: string, maxCharacters?: number) {
  const limited =
    typeof maxCharacters === "number"
      ? Array.from(value.trim()).slice(0, maxCharacters).join("")
      : value.trim();

  return limited
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s-]+|[.\s-]+$/g, "");
}
