/**
 * plans.ts — PLANS screen (Phase 2, Stonic Pricing: Lifetime $56 /
 * Cloud Basic $19 / Power $49, "every feature included, nothing
 * locked"). DISPLAY ONLY — Unique AI is the user's personal app, not
 * a store: there is NO payment here, no card, no checkout, and the
 * panel says so in one plain line. The tiers are shown so the user
 * can compare what Stonic charges, and the usage line shows the
 * app's REAL local counters (messages today, alarms, memories) —
 * never an invented cloud balance.
 */

export interface PlanTier {
  id: 'lifetime' | 'basic' | 'power';
  name: string;
  price: string;
  tag: string;
  points: string[];
}

export const PLAN_TIERS: PlanTier[] = [
  {
    id: 'lifetime',
    name: 'Lifetime',
    price: '$56 — ایک بار',
    tag: 'سب سے بہتر قیمت',
    points: [
      'ایک بار ادائیگی، پھر کبھی ماہانہ فیس نہیں',
      '3 کمپیوٹرز پر چلے',
      'پہلا مہینہ Cloud مفت ($19 کی قیمت)',
      'پھر اپنی API keys — کوئی حد نہیں',
    ],
  },
  {
    id: 'basic',
    name: 'Cloud Basic',
    price: '$19 — ماہانہ',
    tag: 'روز کی بات چیت',
    points: [
      'ہر فیچر شامل، کچھ بھی بند نہیں',
      'کوئی API key نہیں چاہیے',
      'تیز جواب + مشکل سوالوں کے لیے ہوشیار موڈ',
      '3 کمپیوٹرز پر ایک ساتھ',
    ],
  },
  {
    id: 'power',
    name: 'Cloud Power',
    price: '$49 — ماہانہ',
    tag: 'گھنٹوں بات کرنے والوں کے لیے',
    points: [
      'Basic سے تقریباً 3.5 گنا زیادہ استعمال',
      'لمبی گفتگو اور مصروف دنوں کے لیے جگہ',
      'WhatsApp پر ترجیحی مدد',
    ],
  },
];

export const PLANS_NOTE =
  'یہ صرف معلومات ہے — Unique AI میں کوئی ادائیگی نہیں ہوتی، نہ کوئی کارڈ مانگا جاتا ہے۔ سٹونک کی قیمتیں اس لیے دکھائی گئی ہیں تاکہ آپ موازنہ کر سکیں۔';

export interface UsageSummaryInput {
  messagesToday: number;
  alarmsActive: number;
  memoriesCount: number;
  charactersCount: number;
}

/** Real local usage, in one honest line — never a fake cloud balance. */
export function usageSummaryLine(input: UsageSummaryInput): string {
  return `آج ${input.messagesToday} پیغام · ${input.alarmsActive} الارم لگے ہوئے · ${input.memoriesCount} یادیں محفوظ · ${input.charactersCount} کردار`;
}
