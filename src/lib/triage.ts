/**
 * Incident triage helpers — plain keyword rules and a points table, not a
 * model. Every suggestion carries the words that triggered it and every
 * severity carries its reasons, so the UI can show exactly why.
 *
 *  - suggestCategory(text): keyword match in English, Hindi and a few words in
 *    each other citizen language (bn, mr, ta, te, gu, kn).
 *  - computeSeverity(facts): additive points from category, time to the next
 *    train, premium service, running line and an existing speed restriction.
 */

export type TriageCategory = 'track' | 'signal' | 'ohe' | 'lc' | 'fire' | 'obstruction' | 'other';

/** Latin keywords match at a word start; Indic keywords match as substrings (no word boundaries in those scripts). */
const KEYWORDS: Record<Exclude<TriageCategory, 'other'>, string[]> = {
  track: [
    // en
    'track', 'rail', 'crack', 'fracture', 'broken rail', 'weld', 'buckl', 'sleeper', 'ballast', 'lurch', 'jerk', 'fishplate', 'fish plate', 'washout', 'wash away', 'misalign', 'p-way', 'pway',
    // hi
    'पटरी', 'रेल पटरी', 'दरार', 'टूटी', 'वेल्ड', 'स्लीपर', 'गिट्टी', 'झटका', 'फिश प्लेट',
    // bn · mr · ta · te · gu · kn
    'রেললাইন', 'ফাটল', 'रूळ', 'तडा', 'தண்டவாளம்', 'விரிசல்', 'పట్టా', 'పగులు', 'પાટા', 'તિરાડ', 'ಹಳಿ', 'ಬಿರುಕು',
  ],
  ohe: [
    'wire', 'ohe', 'overhead', 'catenary', 'contact wire', 'dropper', 'insulator', 'spark', 'pantograph', 'mast', 'sagging', 'live wire', 'electric pole',
    'तार', 'ओएचई', 'बिजली', 'इंसुलेटर', 'चिंगारी',
    'তার', 'বিদ্যুৎ', 'மின்கம்பி', 'மின்சார', 'తీగ', 'విద్యుత్', 'વાયર', 'વીજળી', 'ತಂತಿ', 'ವಿದ್ಯುತ್',
  ],
  signal: [
    'signal', 'lamp', 'aspect', 'point machine', 'points', 'track circuit', 'axle counter', 'interlocking', 'relay',
    'सिग्नल', 'कांटा', 'पॉइंट',
    'সিগন্যাল', 'சிக்னல்', 'సిగ్నల్', 'સિગ્નલ', 'ಸಿಗ್ನಲ್',
  ],
  fire: [
    'fire', 'smoke', 'burning', 'flame', 'blaze',
    'आग', 'धुआँ', 'धुआं', 'धुंआ', 'लपट', 'जल रहा',
    'আগুন', 'ধোঁয়া', 'धूर', 'தீ', 'புகை', 'మంట', 'పొగ', 'నిప్పు', 'આગ', 'ધુમાડો', 'ಬೆಂಕಿ', 'ಹೊಗೆ',
  ],
  lc: [
    'gate', 'level crossing', 'lc', 'gateman', 'barrier', 'boom',
    'फाटक', 'समपार', 'गेटमैन',
    'গেট', 'লেভেল ক্রসিং', 'கேட்', 'கடவு', 'గేటు', 'ફાટક', 'ಗೇಟ್',
  ],
  obstruction: [
    'animal', 'cattle', 'cow', 'buffalo', 'tree', 'branch', 'boulder', 'stone', 'obstruction', 'debris', 'vehicle', 'tractor', 'landslide', 'flood', 'water logging', 'waterlogging',
    'जानवर', 'पशु', 'गाय', 'भैंस', 'पेड़', 'डाल', 'पत्थर', 'मलबा', 'रुकावट', 'बाढ़',
    'গাছ', 'পশু', 'গরু', 'झाड', 'जनावर', 'மரம்', 'மாடு', 'చెట్టు', 'పశువు', 'ઝાડ', 'પશુ', 'ગાય', 'ಮರ', 'ಹಸು',
  ],
};

/**
 * Tie-break when two categories match the same number of words. "track" is
 * last because the word is also used for a location ("cattle on track",
 * "tree on the track"); real track defects match several track words.
 */
const PRIORITY: Exclude<TriageCategory, 'other'>[] = ['fire', 'ohe', 'signal', 'lc', 'obstruction', 'track'];

const isLatin = (w: string) => /^[\x20-\x7e]+$/.test(w);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function matches(text: string, kw: string): boolean {
  if (!isLatin(kw)) return text.includes(kw);
  // short words must stand alone ("lc", "mast", "rail(s)"); longer ones may be stems ("buckl" → buckled)
  const re = kw.length <= 4 ? `(^|[^a-z0-9])${escapeRe(kw)}(s|es)?([^a-z0-9]|$)` : `(^|[^a-z0-9])${escapeRe(kw)}`;
  return new RegExp(re, 'i').test(text);
}

export interface CategorySuggestion {
  category: TriageCategory;
  /** the words in the text that produced the suggestion */
  matched: string[];
}

/** Rule-based category suggestion for a free-text report. Returns null when no rule matches. */
export function suggestCategory(text: string | null | undefined): CategorySuggestion | null {
  const s = String(text ?? '').toLowerCase().trim();
  if (!s) return null;
  const hits = PRIORITY.map((cat) => ({ cat, hit: KEYWORDS[cat].filter((kw) => matches(s, kw.toLowerCase())) }));
  const all = hits.flatMap((h) => h.hit);
  let best: CategorySuggestion | null = null;
  for (const { cat, hit } of hits) {
    // a longer matched phrase that contains a shorter keyword counts once, in its own category
    // ("broken rail" + "rail"; "track circuit" is S&T, not track)
    const matched = hit.filter((kw) => !all.some((o) => o !== kw && o.length > kw.length && o.includes(kw)));
    if (!matched.length) continue;
    if (!best || matched.length > best.matched.length) best = { category: cat, matched };
  }
  return best;
}

export type SeverityLevel = 'high' | 'medium' | 'low';

export interface SeverityFacts {
  category: TriageCategory;
  /** minutes until the next timetabled train reaches the location (null = unknown) */
  minutesToNextTrain?: number | null;
  /** that next train is a premium service (Vande Bharat, Rajdhani, Shatabdi …) */
  premiumNext?: boolean;
  /** the location is on a running line of the corridor (not yard / unknown) */
  onMainLine?: boolean;
  /** a speed restriction is already in force over the location */
  tsrInForce?: boolean;
}

export interface SeverityFactor {
  key: 'category' | 'nextTrain' | 'nextTrainUnknown' | 'premium' | 'mainLine' | 'offLine' | 'tsr';
  points: number;
  params: Record<string, string | number>;
}

export interface SeverityResult {
  level: SeverityLevel;
  /** English sentences, one per factor, in the order they were scored */
  reasons: string[];
  /** the same factors as data (key + points + params) so the UI can render them in any language */
  factors: SeverityFactor[];
  points: number;
}

const CATEGORY_POINTS: Record<TriageCategory, number> = { fire: 3, track: 3, ohe: 3, obstruction: 2, signal: 2, lc: 2, other: 1 };

/** Thresholds of the points table (documented so the UI can print them). */
export const SEVERITY_THRESHOLDS = { high: 6, medium: 4 } as const;

/** Additive points table → high / medium / low, with the reason for every point. */
export function computeSeverity(facts: SeverityFacts): SeverityResult {
  const factors: SeverityFactor[] = [];
  const reasons: string[] = [];
  const cat = facts.category ?? 'other';
  const cp = CATEGORY_POINTS[cat] ?? 1;
  factors.push({ key: 'category', points: cp, params: { category: cat } });
  reasons.push(`Category "${cat}" (+${cp})`);

  const m = facts.minutesToNextTrain;
  if (m === null || m === undefined || !Number.isFinite(m)) {
    factors.push({ key: 'nextTrainUnknown', points: 0, params: {} });
    reasons.push('Next train at this location not known (+0)');
  } else {
    const p = m <= 15 ? 2 : m <= 60 ? 1 : 0;
    factors.push({ key: 'nextTrain', points: p, params: { min: Math.round(m) } });
    reasons.push(`Next train due in ${Math.round(m)} min (+${p})`);
  }
  if (facts.premiumNext) {
    factors.push({ key: 'premium', points: 1, params: {} });
    reasons.push('Next train is a premium service (+1)');
  }
  if (facts.onMainLine) {
    factors.push({ key: 'mainLine', points: 1, params: {} });
    reasons.push('On a running line (+1)');
  } else {
    factors.push({ key: 'offLine', points: 0, params: {} });
    reasons.push('Running line not identified (+0)');
  }
  if (facts.tsrInForce) {
    factors.push({ key: 'tsr', points: -1, params: {} });
    reasons.push('Speed restriction already in force here (−1)');
  }
  const points = factors.reduce((s, f) => s + f.points, 0);
  const level: SeverityLevel = points >= SEVERITY_THRESHOLDS.high ? 'high' : points >= SEVERITY_THRESHOLDS.medium ? 'medium' : 'low';
  return { level, reasons, factors, points };
}
