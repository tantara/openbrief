export type TranscriptionLanguageCode =
  | "auto"
  | "af"
  | "am"
  | "ar"
  | "as"
  | "az"
  | "ba"
  | "be"
  | "bg"
  | "bn"
  | "bo"
  | "br"
  | "bs"
  | "ca"
  | "cs"
  | "cy"
  | "da"
  | "de"
  | "el"
  | "en"
  | "es"
  | "et"
  | "eu"
  | "fa"
  | "fi"
  | "fil"
  | "fo"
  | "fr"
  | "gl"
  | "gu"
  | "ha"
  | "haw"
  | "he"
  | "hi"
  | "hr"
  | "ht"
  | "hu"
  | "hy"
  | "id"
  | "is"
  | "it"
  | "ja"
  | "jw"
  | "ka"
  | "kk"
  | "km"
  | "kn"
  | "ko"
  | "la"
  | "lb"
  | "ln"
  | "lo"
  | "lt"
  | "lv"
  | "mg"
  | "mi"
  | "mk"
  | "ml"
  | "mn"
  | "mr"
  | "ms"
  | "mt"
  | "my"
  | "ne"
  | "nl"
  | "nn"
  | "no"
  | "oc"
  | "pa"
  | "pl"
  | "ps"
  | "pt"
  | "ro"
  | "ru"
  | "sa"
  | "sd"
  | "si"
  | "sk"
  | "sl"
  | "sn"
  | "so"
  | "sq"
  | "sr"
  | "su"
  | "sv"
  | "sw"
  | "ta"
  | "te"
  | "tg"
  | "th"
  | "tk"
  | "tl"
  | "tr"
  | "tt"
  | "uk"
  | "ur"
  | "uz"
  | "vi"
  | "yi"
  | "yo"
  | "yue"
  | "zh";

export interface TranscriptionLanguage {
  code: TranscriptionLanguageCode;
  label: string;
}

export type LocalSttEngine = "fluidaudio" | "whisper.cpp" | "qwen3-asr";

export interface LocalSttModelCard {
  id: string;
  name: string;
  engine: LocalSttEngine;
  supportedLanguages: readonly TranscriptionLanguage[];
}

export type Qwen3TtsLanguageCode =
  | "zh"
  | "en"
  | "ja"
  | "ko"
  | "de"
  | "fr"
  | "ru"
  | "pt"
  | "es"
  | "it";

export type LocalTtsEngine = "supertonic" | "qwen";

export interface LocalTtsModelCard {
  id: string;
  name: string;
  engine: LocalTtsEngine;
  supportedLanguages: readonly TranscriptionLanguage[];
}

const autoLanguage = {
  code: "auto",
  label: "Auto-detect",
} as const satisfies TranscriptionLanguage;

export const parakeetV3Languages = [
  { code: "bg", label: "Bulgarian" },
  { code: "hr", label: "Croatian" },
  { code: "cs", label: "Czech" },
  { code: "da", label: "Danish" },
  { code: "nl", label: "Dutch" },
  { code: "en", label: "English" },
  { code: "et", label: "Estonian" },
  { code: "fi", label: "Finnish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "el", label: "Greek" },
  { code: "hu", label: "Hungarian" },
  { code: "it", label: "Italian" },
  { code: "lv", label: "Latvian" },
  { code: "lt", label: "Lithuanian" },
  { code: "mt", label: "Maltese" },
  { code: "pl", label: "Polish" },
  { code: "pt", label: "Portuguese" },
  { code: "ro", label: "Romanian" },
  { code: "sk", label: "Slovak" },
  { code: "sl", label: "Slovenian" },
  { code: "es", label: "Spanish" },
  { code: "sv", label: "Swedish" },
  { code: "ru", label: "Russian" },
  { code: "uk", label: "Ukrainian" },
] as const satisfies readonly TranscriptionLanguage[];

export const qwen3AsrLanguages = [
  { code: "zh", label: "Chinese" },
  { code: "en", label: "English" },
  { code: "yue", label: "Cantonese" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "pt", label: "Portuguese" },
  { code: "ru", label: "Russian" },
  { code: "es", label: "Spanish" },
] as const satisfies readonly TranscriptionLanguage[];

export const whisperLanguages = [
  { code: "af", label: "Afrikaans" },
  { code: "am", label: "Amharic" },
  { code: "ar", label: "Arabic" },
  { code: "as", label: "Assamese" },
  { code: "az", label: "Azerbaijani" },
  { code: "ba", label: "Bashkir" },
  { code: "be", label: "Belarusian" },
  { code: "bg", label: "Bulgarian" },
  { code: "bn", label: "Bengali" },
  { code: "bo", label: "Tibetan" },
  { code: "br", label: "Breton" },
  { code: "bs", label: "Bosnian" },
  { code: "ca", label: "Catalan" },
  { code: "cs", label: "Czech" },
  { code: "cy", label: "Welsh" },
  { code: "da", label: "Danish" },
  { code: "de", label: "German" },
  { code: "el", label: "Greek" },
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "et", label: "Estonian" },
  { code: "eu", label: "Basque" },
  { code: "fa", label: "Persian" },
  { code: "fi", label: "Finnish" },
  { code: "fo", label: "Faroese" },
  { code: "fr", label: "French" },
  { code: "gl", label: "Galician" },
  { code: "gu", label: "Gujarati" },
  { code: "ha", label: "Hausa" },
  { code: "haw", label: "Hawaiian" },
  { code: "he", label: "Hebrew" },
  { code: "hi", label: "Hindi" },
  { code: "hr", label: "Croatian" },
  { code: "ht", label: "Haitian Creole" },
  { code: "hu", label: "Hungarian" },
  { code: "hy", label: "Armenian" },
  { code: "id", label: "Indonesian" },
  { code: "is", label: "Icelandic" },
  { code: "it", label: "Italian" },
  { code: "ja", label: "Japanese" },
  { code: "jw", label: "Javanese" },
  { code: "ka", label: "Georgian" },
  { code: "kk", label: "Kazakh" },
  { code: "km", label: "Khmer" },
  { code: "kn", label: "Kannada" },
  { code: "ko", label: "Korean" },
  { code: "la", label: "Latin" },
  { code: "lb", label: "Luxembourgish" },
  { code: "ln", label: "Lingala" },
  { code: "lo", label: "Lao" },
  { code: "lt", label: "Lithuanian" },
  { code: "lv", label: "Latvian" },
  { code: "mg", label: "Malagasy" },
  { code: "mi", label: "Maori" },
  { code: "mk", label: "Macedonian" },
  { code: "ml", label: "Malayalam" },
  { code: "mn", label: "Mongolian" },
  { code: "mr", label: "Marathi" },
  { code: "ms", label: "Malay" },
  { code: "mt", label: "Maltese" },
  { code: "my", label: "Myanmar" },
  { code: "ne", label: "Nepali" },
  { code: "nl", label: "Dutch" },
  { code: "nn", label: "Norwegian Nynorsk" },
  { code: "no", label: "Norwegian" },
  { code: "oc", label: "Occitan" },
  { code: "pa", label: "Punjabi" },
  { code: "pl", label: "Polish" },
  { code: "ps", label: "Pashto" },
  { code: "pt", label: "Portuguese" },
  { code: "ro", label: "Romanian" },
  { code: "ru", label: "Russian" },
  { code: "sa", label: "Sanskrit" },
  { code: "sd", label: "Sindhi" },
  { code: "si", label: "Sinhala" },
  { code: "sk", label: "Slovak" },
  { code: "sl", label: "Slovenian" },
  { code: "sn", label: "Shona" },
  { code: "so", label: "Somali" },
  { code: "sq", label: "Albanian" },
  { code: "sr", label: "Serbian" },
  { code: "su", label: "Sundanese" },
  { code: "sv", label: "Swedish" },
  { code: "sw", label: "Swahili" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "tg", label: "Tajik" },
  { code: "th", label: "Thai" },
  { code: "tk", label: "Turkmen" },
  { code: "tl", label: "Tagalog" },
  { code: "tr", label: "Turkish" },
  { code: "tt", label: "Tatar" },
  { code: "uk", label: "Ukrainian" },
  { code: "ur", label: "Urdu" },
  { code: "uz", label: "Uzbek" },
  { code: "vi", label: "Vietnamese" },
  { code: "yi", label: "Yiddish" },
  { code: "yo", label: "Yoruba" },
  { code: "zh", label: "Chinese" },
  { code: "yue", label: "Cantonese" },
] as const satisfies readonly TranscriptionLanguage[];

export const supertonic3Languages = [
  { code: "en", label: "English" },
  { code: "ko", label: "Korean" },
  { code: "ja", label: "Japanese" },
  { code: "ar", label: "Arabic" },
  { code: "bg", label: "Bulgarian" },
  { code: "cs", label: "Czech" },
  { code: "da", label: "Danish" },
  { code: "de", label: "German" },
  { code: "el", label: "Greek" },
  { code: "es", label: "Spanish" },
  { code: "et", label: "Estonian" },
  { code: "fi", label: "Finnish" },
  { code: "fr", label: "French" },
  { code: "hi", label: "Hindi" },
  { code: "hr", label: "Croatian" },
  { code: "hu", label: "Hungarian" },
  { code: "id", label: "Indonesian" },
  { code: "it", label: "Italian" },
  { code: "lt", label: "Lithuanian" },
  { code: "lv", label: "Latvian" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
  { code: "pt", label: "Portuguese" },
  { code: "ro", label: "Romanian" },
  { code: "ru", label: "Russian" },
  { code: "sk", label: "Slovak" },
  { code: "sl", label: "Slovenian" },
  { code: "sv", label: "Swedish" },
  { code: "tr", label: "Turkish" },
  { code: "uk", label: "Ukrainian" },
  { code: "vi", label: "Vietnamese" },
] as const satisfies readonly TranscriptionLanguage[];

export type Supertonic3LanguageCode =
  (typeof supertonic3Languages)[number]["code"];

export const qwen3TtsLanguages = [
  { code: "zh", label: "Chinese" },
  { code: "en", label: "English" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "ru", label: "Russian" },
  { code: "pt", label: "Portuguese" },
  { code: "es", label: "Spanish" },
  { code: "it", label: "Italian" },
] as const satisfies readonly TranscriptionLanguage[];

const whisperModelIds = new Set([
  "whisper-tiny",
  "whisper-base",
  "whisper-small",
  "whisper-medium",
  "whisper-large-v3-turbo-q5",
  "whisper-large-v3-turbo",
]);

const qwen3AsrModelIds = new Set(["qwen3-asr-0.6B", "qwen3-asr-1.7B"]);

export const localSttModelCards = [
  {
    id: "qwen3-asr",
    name: "Qwen3-ASR + ForcedAligner",
    engine: "qwen3-asr",
    supportedLanguages: qwen3AsrLanguages,
  },
  {
    id: "parakeet-tdt-0.6b-v3",
    name: "Parakeet v3",
    engine: "fluidaudio",
    supportedLanguages: parakeetV3Languages,
  },
  {
    id: "whisper",
    name: "Whisper",
    engine: "whisper.cpp",
    supportedLanguages: whisperLanguages,
  },
] as const satisfies readonly LocalSttModelCard[];

const qwen3AsrModelCard = localSttModelCards[0];
const parakeetV3ModelCard = localSttModelCards[1];
const whisperModelCard = localSttModelCards[2];

export const localTtsModelCards = [
  {
    id: "Supertone/supertonic-3",
    name: "Supertonic 3",
    engine: "supertonic",
    supportedLanguages: supertonic3Languages,
  },
  {
    id: "qwen-tts-0.6B",
    name: "Qwen3-TTS 0.6B",
    engine: "qwen",
    supportedLanguages: qwen3TtsLanguages,
  },
  {
    id: "qwen-tts-1.7B",
    name: "Qwen3-TTS 1.7B",
    engine: "qwen",
    supportedLanguages: qwen3TtsLanguages,
  },
] as const satisfies readonly LocalTtsModelCard[];

const supertonic3ModelCard = localTtsModelCards[0];
const qwen3Tts06BModelCard = localTtsModelCards[1];
const qwen3Tts17BModelCard = localTtsModelCards[2];

export function localSttModelCardForModel(modelId?: string): LocalSttModelCard {
  if (modelId && qwen3AsrModelIds.has(modelId)) return qwen3AsrModelCard;
  if (modelId === parakeetV3ModelCard.id) return parakeetV3ModelCard;
  if (!modelId || whisperModelIds.has(modelId)) return whisperModelCard;
  return whisperModelCard;
}

export function transcriptionLanguagesForModel(modelId?: string) {
  return [
    autoLanguage,
    ...localSttModelCardForModel(modelId).supportedLanguages,
  ] as const;
}

export function isLanguageSupportedByModel(
  modelId: string | undefined,
  languageCode: string,
) {
  if (languageCode === "auto") return true;
  return transcriptionLanguagesForModel(modelId).some(
    (language) => language.code === languageCode,
  );
}

export function localTtsModelCardForModel(modelId?: string): LocalTtsModelCard {
  if (!modelId || modelId === supertonic3ModelCard.id) {
    return supertonic3ModelCard;
  }
  if (modelId === qwen3Tts06BModelCard.id) return qwen3Tts06BModelCard;
  if (modelId === qwen3Tts17BModelCard.id) return qwen3Tts17BModelCard;
  return supertonic3ModelCard;
}

export function synthesisLanguagesForModel(modelId?: string) {
  return [...localTtsModelCardForModel(modelId).supportedLanguages] as const;
}

export function isSynthesisLanguageSupportedByModel(
  modelId: string | undefined,
  languageCode: string,
) {
  return synthesisLanguagesForModel(modelId).some(
    (language) => language.code === languageCode,
  );
}
