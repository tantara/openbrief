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

export type LocalSttEngine = "fluidaudio" | "whisper.cpp";

export interface LocalSttModelCard {
  id: string;
  name: string;
  engine: LocalSttEngine;
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

const whisperModelIds = new Set([
  "whisper-tiny",
  "whisper-base",
  "whisper-small",
  "whisper-medium",
  "whisper-large-v3-turbo-q5",
  "whisper-large-v3-turbo",
]);

export const localSttModelCards = [
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

const parakeetV3ModelCard = localSttModelCards[0];
const whisperModelCard = localSttModelCards[1];

export function localSttModelCardForModel(modelId?: string): LocalSttModelCard {
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
