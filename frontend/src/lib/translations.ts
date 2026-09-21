/** Multi-language translations for common VaakSetu sentences (en, hi, kn, te, ta). */

export type LanguageCode = "en" | "hi" | "kn" | "te" | "ta"

export interface TranslationEntry {
  en: string
  hi: string
  kn: string
  te: string
  ta: string
}

export const LANGUAGES: { code: LanguageCode; label: string }[] = [
  { code: "en", label: "English 🇬🇧" },
  { code: "hi", label: "हिन्दी" },
  { code: "kn", label: "ಕನ್ನಡ" },
  { code: "te", label: "తెలుగు" },
  { code: "ta", label: "தமிழ்" },
]

export const translations: Record<string, TranslationEntry> = {
  "I need water": {
    en: "I need water",
    hi: "मुझे पानी चाहिए",
    kn: "ನನಗೆ ನೀರು ಬೇಕು",
    te: "నాకు నీరు కావాలి",
    ta: "எனக்கு தண்ணீர் வேண்டும்",
  },
  "I need food": {
    en: "I need food",
    hi: "मुझे खाना चाहिए",
    kn: "ನನಗೆ ಊಟ ಬೇಕು",
    te: "నాకు అన్నం కావాలి",
    ta: "எனக்கு உணவு வேண்டும்",
  },
  "I need to use the toilet": {
    en: "I need to use the toilet",
    hi: "मुझे शौचालय जाना है",
    kn: "ನನಗೆ ಶೌಚಾಲಯಕ್ಕೆ ಹೋಗಬೇಕು",
    te: "నాకు మరుగుదొడ్డి వెళ్లాలి",
    ta: "எனக்கு கழிவறைக்கு செல்ல வேண்டும்",
  },
  "I have a headache": {
    en: "I have a headache",
    hi: "मुझे सिरदर्द है",
    kn: "ನನಗೆ ತಲೆನೋವು ಇದೆ",
    te: "నాకు తలనొప్పి ఉంది",
    ta: "எனக்கு தலைவலி",
  },
  "I have pain in my chest": {
    en: "I have pain in my chest",
    hi: "मेरे सीने में दर्द है",
    kn: "ನನ್ನ ಎದೆಯಲ್ಲಿ ನೋವು ಇದೆ",
    te: "నా ఛాతీలో నొప్పి ఉంది",
    ta: "என் மார்பில் வலி",
  },
  "Please help me": {
    en: "Please help me",
    hi: "कृपया मेरी मदद करें",
    kn: "ದಯವಿಟ್ಟು ನನಗೆ ಸಹಾಯ ಮಾಡಿ",
    te: "దయచేసి నాకు సహాయం చేయండి",
    ta: "தயவுசெய்து எனக்கு உதவுங்கள்",
  },
  "I love you": {
    en: "I love you",
    hi: "मैं तुमसे प्यार करता हूँ",
    kn: "ನಾನು ನಿನ್ನನ್ನು ಪ್ರೀತಿಸುತ್ತೇನೆ",
    te: "నేను నిన్ను ప్రేమిస్తున్నాను",
    ta: "நான் உன்னை காதலிக்கிறேன்",
  },
  "Call Amma": {
    en: "Call Amma",
    hi: "अम्मा को बुलाओ",
    kn: "ಅಮ್ಮನನ್ನು ಕರೆಯಿರಿ",
    te: "అమ్మను పిలవండి",
    ta: "அம்மாவை அழைக்கவும்",
  },
  "I am hungry": {
    en: "I am hungry",
    hi: "मुझे भूख लगी है",
    kn: "ನನಗೆ ಹಸಿವಾಗಿದೆ",
    te: "నాకు ఆకలిగా ఉంది",
    ta: "எனக்கு பசிக்கிறது",
  },
  "I am tired": {
    en: "I am tired",
    hi: "मैं थक गया हूँ",
    kn: "ನಾನು ಸುಸ್ತಾಗಿದ್ದೇನೆ",
    te: "నేను అలసిపోయాను",
    ta: "நான் சோர்ந்துவிட்டேன்",
  },
  "I want to sleep": {
    en: "I want to sleep",
    hi: "मुझे सोना है",
    kn: "ನನಗೆ ಮಲಗಬೇಕು",
    te: "నాకు నిద్రపోవాలి",
    ta: "எனக்கு தூக்கம் வருகிறது",
  },
  "It is too hot": {
    en: "It is too hot",
    hi: "बहुत गर्मी है",
    kn: "ತುಂಬಾ ಬಿಸಿಯಾಗಿದೆ",
    te: "చాలా వేడిగా ఉంది",
    ta: "மிகவும் சூடாக உள்ளது",
  },
  "It is too cold": {
    en: "It is too cold",
    hi: "बहुत ठंड है",
    kn: "ತುಂಬಾ ಚಳಿಯಾಗಿದೆ",
    te: "చాలా చలిగా ఉంది",
    ta: "மிகவும் குளிராக உள்ளது",
  },
  "I am happy": {
    en: "I am happy",
    hi: "मैं खुश हूँ",
    kn: "ನಾನು ಸಂತೋಷವಾಗಿದ್ದೇನೆ",
    te: "నేను సంతోషంగా ఉన్నాను",
    ta: "நான் மகிழ்ச்சியாக இருக்கிறேன்",
  },
  "I am scared": {
    en: "I am scared",
    hi: "मुझे डर लग रहा है",
    kn: "ನನಗೆ ಭಯವಾಗಿದೆ",
    te: "నాకు భయంగా ఉంది",
    ta: "எனக்கு பயமாக இருக்கிறது",
  },
}

/** Longest keys first so substring matching prefers the most specific sentence. */
const KEYS = Object.keys(translations).sort((a, b) => b.length - a.length)

/**
 * Pictogram-generated sentences don't always match a map key word-for-word
 * (e.g. "I have pain in my head." vs "I have a headache"), so map the gaps.
 */
const ALIASES: [RegExp, string][] = [
  [/pain in my head|\bheadache\b|\bhead\b/, "I have a headache"],
  [/\bchest\b/, "I have pain in my chest"],
  [/\btoilet\b/, "I need to use the toilet"],
  [/\bneed help\b|\bhelp me\b/, "Please help me"],
  [/\bfood\b|\bhungry\b/, "I need food"],
  [/\bwater\b/, "I need water"],
]

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Finds the translation entry for a generated sentence: exact key match,
 * then normalized substring match, then keyword aliases. Returns null when
 * no translation is available (caller falls back to English).
 */
export function lookupTranslation(sentence: string): TranslationEntry | null {
  if (translations[sentence]) return translations[sentence]

  const normalized = normalize(sentence)
  for (const key of KEYS) {
    if (normalized.includes(normalize(key))) return translations[key]
  }
  for (const [pattern, key] of ALIASES) {
    if (pattern.test(normalized)) return translations[key]
  }
  return null
}
