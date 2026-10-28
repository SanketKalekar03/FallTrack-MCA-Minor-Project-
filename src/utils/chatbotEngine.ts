/**
 * FallTrack Chatbot Deterministic Business Query & Intent Engine
 * 
 * Implements deterministic business calculations, rate resolution,
 * query classification, and guardrails for FallTrack.
 */

import type { Color, ProductionEntry, Rate, IncomePeriod } from '../types';
import { matchColor } from './transliterate';

export type QueryCategory = 
  | 'production'
  | 'rate'
  | 'income'
  | 'billing'
  | 'help'
  | 'unsupported'
  | 'greeting'
  | 'irrelevant'
  | 'general';

export interface ParsedIntent {
  category: QueryCategory;
  dateRange?: {
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
    label: string;
  };
  targetDate?: string; // YYYY-MM-DD
  colorFilter?: string; // Color name or query
  includeColorBreakdown?: boolean;
  unsupportedReason?: string;
  helpTopic?: string;
  originalQuery: string;
}

export interface BusinessQueryResult {
  category: QueryCategory;
  summary: string;
  facts: Record<string, any>;
  formattedText: string;
  isUnsupported?: boolean;
}

// -------------------------------------------------------------
// Date Utility Helpers
// -------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');

export const formatDateStr = (date: Date): string => {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const parseDateString = (input: string, referenceDateStr?: string): string | null => {
  const refDate = referenceDateStr ? new Date(referenceDateStr) : new Date();
  const lower = input.toLowerCase().trim();

  // 1. Explicit Relative keywords anywhere in string
  if (/\byesterday\b/.test(lower)) {
    const d = new Date(refDate);
    d.setDate(d.getDate() - 1);
    return formatDateStr(d);
  }
  if (/\btoday\b/.test(lower)) {
    return formatDateStr(refDate);
  }

  // 2. ISO format: YYYY-MM-DD
  const isoMatch = lower.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    return `${y}-${pad(m)}-${pad(d)}`;
  }

  // 3. DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = lower.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
  if (dmyMatch) {
    const d = parseInt(dmyMatch[1], 10);
    const m = parseInt(dmyMatch[2], 10);
    const y = parseInt(dmyMatch[3], 10);
    return `${y}-${pad(m)}-${pad(d)}`;
  }

  // 4. Natural dates with strict word boundaries: e.g. "10 October 2026", "10th Oct 2026", "October 10"
  const monthNames = [
    { full: 'january', short: 'jan', m: 1 },
    { full: 'february', short: 'feb', m: 2 },
    { full: 'march', short: 'mar', m: 3 },
    { full: 'april', short: 'apr', m: 4 },
    { full: 'may', short: 'may', m: 5 },
    { full: 'june', short: 'jun', m: 6 },
    { full: 'july', short: 'jul', m: 7 },
    { full: 'august', short: 'aug', m: 8 },
    { full: 'september', short: 'sep', m: 9 },
    { full: 'october', short: 'oct', m: 10 },
    { full: 'november', short: 'nov', m: 11 },
    { full: 'december', short: 'dec', m: 12 }
  ];

  for (const mObj of monthNames) {
    const patA = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?(?:${mObj.full}|${mObj.short})\\s*(20\\d{2})?\\b`, 'i');
    const matchA = lower.match(patA);
    if (matchA) {
      const day = parseInt(matchA[1], 10);
      const year = matchA[2] ? parseInt(matchA[2], 10) : refDate.getFullYear();
      if (day >= 1 && day <= 31) {
        return `${year}-${pad(mObj.m)}-${pad(day)}`;
      }
    }

    const patB = new RegExp(`\\b(?:${mObj.full}|${mObj.short})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(20\\d{2})?\\b`, 'i');
    const matchB = lower.match(patB);
    if (matchB) {
      const day = parseInt(matchB[1], 10);
      const year = matchB[2] ? parseInt(matchB[2], 10) : refDate.getFullYear();
      if (day >= 1 && day <= 31) {
        return `${year}-${pad(mObj.m)}-${pad(day)}`;
      }
    }
  }

  return null;
};

export const getDateRangeForPeriod = (period: string, refDateStr?: string): { startDate: string; endDate: string; label: string } => {
  const refDate = refDateStr ? new Date(refDateStr) : new Date();
  const lower = period.toLowerCase();

  // Explicit All-Time / Entire History keywords
  if (lower.includes('all time') || lower.includes('overall') || lower.includes('total') || lower.includes('all') || lower.includes('so far') || lower.includes('history')) {
    return { startDate: '2000-01-01', endDate: '2099-12-31', label: 'All-Time (Overall Production)' };
  }

  if (lower.includes('today')) {
    const d = formatDateStr(refDate);
    return { startDate: d, endDate: d, label: `Today (${d})` };
  }

  if (lower.includes('yesterday')) {
    const d = new Date(refDate);
    d.setDate(d.getDate() - 1);
    const s = formatDateStr(d);
    return { startDate: s, endDate: s, label: `Yesterday (${s})` };
  }

  if (lower.includes('this week') || lower.includes('current week') || lower.includes('week')) {
    const d = new Date(refDate);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const startOfWeek = new Date(d.setDate(diff));
    const s = formatDateStr(startOfWeek);
    const e = formatDateStr(refDate);
    return { startDate: s, endDate: e, label: `This Week (${s} to ${e})` };
  }

  if (lower.includes('this month') || lower.includes('current month')) {
    const year = refDate.getFullYear();
    const month = refDate.getMonth();
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0);
    const s = formatDateStr(startOfMonth);
    const e = formatDateStr(endOfMonth);
    const monthName = refDate.toLocaleString('default', { month: 'long' });
    return { startDate: s, endDate: e, label: `${monthName} ${year}` };
  }

  // Named month detection: e.g. "October", "September"
  const monthNames = [
    { name: 'january', m: 0 }, { name: 'february', m: 1 }, { name: 'march', m: 2 },
    { name: 'april', m: 3 }, { name: 'may', m: 4 }, { name: 'june', m: 5 },
    { name: 'july', m: 6 }, { name: 'august', m: 7 }, { name: 'september', m: 8 },
    { name: 'october', m: 9 }, { name: 'november', m: 10 }, { name: 'december', m: 11 }
  ];
  for (const item of monthNames) {
    if (new RegExp(`\\b${item.name}\\b`, 'i').test(lower)) {
      const yearMatch = lower.match(/\b(20\d{2})\b/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : refDate.getFullYear();
      const start = new Date(year, item.m, 1);
      const end = new Date(year, item.m + 1, 0);
      const s = formatDateStr(start);
      const e = formatDateStr(end);
      const label = `${item.name.charAt(0).toUpperCase() + item.name.slice(1)} ${year}`;
      return { startDate: s, endDate: e, label };
    }
  }

  // Default when no period is specified: All-Time
  return { startDate: '2000-01-01', endDate: '2099-12-31', label: 'All-Time (Overall Production)' };
};

// -------------------------------------------------------------
// Intent Classification
// -------------------------------------------------------------

export const parseUserIntent = (query: string, clientDate?: string): ParsedIntent => {
  const q = query.trim().toLowerCase();
  const refDateStr = clientDate || formatDateStr(new Date());

  // 1. GREETINGS & CASUAL INTRODUCTIONS
  const greetingPhrases = [
    'hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening',
    'namaste', 'who are you', 'what can you do', 'what are you', 'help me',
    'thanks', 'thank you'
  ];
  const isDirectGreeting = greetingPhrases.some(
    p => q === p || q.startsWith(p + ' ') || q.endsWith(' ' + p) || q === p + '!' || q === p + '?'
  );
  if (isDirectGreeting) {
    return {
      category: 'greeting',
      originalQuery: query
    };
  }

  // 2. STRICTLY EXCLUDED / UNSUPPORTED ACTIONS & MUTATION GUARDRAIL
  // Detects requests to insert, add, create, update, change, modify, set, delete, or remove records/rates.
  // FallTrack chatbot is strictly read-only and cannot perform direct data mutations.
  const isProdMutation = 
    /\b(?:add|insert|enter|put|create|log|record|save|write|submit)\b.*\b(?:fall|falls|bundle|bundles|entry|entries|piece|pieces|production|record|records)\b/i.test(q)
    || /\b(?:add|insert|enter|put|log|record|save)\s+\d+/i.test(q)
    || /\b(?:फॉल|फॉल्स|नोंद|नोंदी)\b.*\b(?:टाका|करा|ऍड|नोंदवा)\b/i.test(q);

  const isRateMutation = 
    /\b(?:change|set|update|modify|edit|alter|adjust|increase|decrease|make|put|fix)\b.*\b(?:rate|rates|rate\s+per\s+dozen|price|cost|amount|dozens?)\b/i.test(q)
    || /\b(?:rate|rates|price)\b.*\b(?:to\s+\d+|change|update|set|increase|decrease)\b/i.test(q)
    || /\b(?:दर|रेट)\b.*\b(?:बदला|वाढवा|कमी\s*करा|करा)\b/i.test(q);

  const isDeletion = 
    /\b(?:delete|remove|clear|erase|drop|cancel|purge|wipe|discard)\b/i.test(q);

  const isColorMutation = 
    !q.startsWith('how') && 
    /\b(?:add|insert|create|delete|remove|new)\b.*\b(?:colou?r|colou?rs|shade|shades)\b/i.test(q);

  const isExcludedFeature = 
    /\b(?:worker|workers|inventory|stock|payroll|customer|customers)\b/i.test(q);

  if (isProdMutation || isRateMutation || isDeletion || isColorMutation || isExcludedFeature) {
    let reason = 'FallTrack AI is a read-only assistant and cannot add, modify, or delete records.';
    
    if (isProdMutation) {
      reason = 'FallTrack AI is a read-only assistant and cannot add or record production entries directly.\n\n👉 **To add or log your production:**\n1. Open the **Daily Records** page from the sidebar.\n2. Select your date and color, enter your completed falls count, and click **Save Entry**.';
    } else if (isRateMutation) {
      reason = 'FallTrack AI is a read-only assistant and cannot change or update rates.\n\n👉 **To update your Rate per Dozen:**\n1. Go to the **Settings** page from the sidebar.\n2. In the **Rate per Dozen** section, enter your new rate and click **Save Settings**.';
    } else if (isDeletion) {
      reason = 'FallTrack AI is strictly read-only and cannot delete records.\n\n👉 **To edit or delete entries:**\n• You can edit or delete entries for **today** directly on the **Daily Records** page.\n• Past-day entries are locked to protect verified historical accounting.';
    } else if (isColorMutation) {
      reason = 'Colors cannot be added or deleted through chat.\n\n👉 **To manage colors:**\n• Visit the **Color Management** page to add new shades with English and Marathi names.';
    } else if (isExcludedFeature) {
      reason = 'FallTrack focuses purely on completed saree fall production bundle logs, piece rates, and billing cycles. Worker tracking, stock inventory, and customer management are not tracked by the system.';
    }

    return {
      category: 'unsupported',
      unsupportedReason: reason,
      originalQuery: query
    };
  }

  // 2. HELP QUERIES
  const isHelpIntent = 
    q.startsWith('how do i') ||
    q.startsWith('how to') ||
    q.startsWith('how can i') ||
    q.includes('why can\'t i') ||
    q.includes('why cant i') ||
    q.includes('why cannot i') ||
    q.includes('how is income calculated') ||
    q.includes('explain how my income') ||
    q.includes('how to calculate income') ||
    q.includes('help') ||
    q.includes('how does falltrack work') ||
    q.includes('how to use');

  if (isHelpIntent) {
    let topic: string | null = null;
    if (q.includes('colour') || q.includes('color')) {
      topic = 'add_color';
    } else if (q.includes('production') || q.includes('enter') || q.includes('entry') || q.includes('log') || q.includes('record')) {
      topic = 'daily_entry';
    } else if (q.includes('rate') || q.includes('price')) {
      topic = 'rate_update';
    } else if (q.includes('edit') || q.includes('yesterday') || q.includes('lock') || q.includes('delete') || q.includes('change')) {
      topic = 'lock_policy';
    } else if (q.includes('income') || q.includes('calculate') || q.includes('formula') || q.includes('explain') || q.includes('earn')) {
      topic = 'income_formula';
    } else if (q.includes('falltrack') || q.includes('app') || q.includes('system') || q === 'help' || q === 'help me' || q.includes('how to use')) {
      topic = 'general';
    }

    if (topic) {
      return {
        category: 'help',
        helpTopic: topic,
        originalQuery: query
      };
    }
  }

  // 3. BILLING-PERIOD QUERIES
  if (
    q.includes('billing period') ||
    q.includes('income period') ||
    q.includes('billing cycle') ||
    q.includes('last period') ||
    q.includes('latest period') ||
    q.includes('saved period') ||
    q.includes('settlement') ||
    q.includes('billing')
  ) {
    return {
      category: 'billing',
      originalQuery: query
    };
  }

  // 4. RATE QUERIES
  const isRateQuery = /\b(?:rate|rates|rate\s+per\s+dozen|price\s+per\s+dozen|cost\s+per\s+dozen|rate\s+card|rate\s+list|price\s+list)\b/i.test(q);
  if (
    isRateQuery &&
    !q.includes('income') &&
    !q.includes('earn') &&
    !q.includes('salary')
  ) {
    const specificDate = parseDateString(q, refDateStr);
    return {
      category: 'rate',
      targetDate: specificDate || refDateStr,
      originalQuery: query
    };
  }

  // Check for Color breakdown request
  const breakdownRequested = 
    q.includes('break down') || 
    q.includes('breakdown') || 
    q.includes('by colour') || 
    q.includes('by color') || 
    q.includes('color wise') || 
    q.includes('colour wise');

  // Check for specific color filter
  let identifiedColor: string | undefined;
  const knownColors = [
    'राणी', 'rani', 'लाल', 'lal', 'पांढरा', 'pandhra', 'white',
    'केशरी', 'keshari', 'kesari', 'orange', 'निळा', 'nila', 'blue',
    'हिरवा', 'hirva', 'green', 'पिवळा', 'pivla', 'yellow',
    'गुलाबी', 'gulabi', 'pink', 'काळा', 'kala', 'black',
    'राजवाडी', 'rajwadi', 'मोरपंखी', 'morpankhi', 'जांभळा', 'jambhla'
  ];
  for (const c of knownColors) {
    const wordBoundary = new RegExp(`\\b${c}\\b`, 'i');
    if (wordBoundary.test(q)) {
      identifiedColor = c;
      break;
    }
  }

  // Range detection between two dates: "between X and Y" or "from X to Y"
  const rangeMatch = q.match(/(?:between|from)\s+([a-zA-Z0-9\s,-]+?)\s+(?:and|to)\s+([a-zA-Z0-9\s,-]+)/i);
  let customRange: { startDate: string; endDate: string; label: string } | undefined;
  if (rangeMatch) {
    const s = parseDateString(rangeMatch[1], refDateStr);
    const e = parseDateString(rangeMatch[2], refDateStr);
    if (s && e) {
      customRange = {
        startDate: s <= e ? s : e,
        endDate: s <= e ? e : s,
        label: `${s} to ${e}`
      };
    }
  }

  // Date range determination
  let dateRange = customRange;
  if (!dateRange) {
    if (/\btoday\b/i.test(q)) {
      dateRange = getDateRangeForPeriod('today', refDateStr);
    } else if (/\byesterday\b/i.test(q)) {
      dateRange = getDateRangeForPeriod('yesterday', refDateStr);
    } else if (/\b(?:this\s+week|current\s+week|week)\b/i.test(q)) {
      dateRange = getDateRangeForPeriod('this week', refDateStr);
    } else if (/\b(?:this\s+month|current\s+month)\b/i.test(q)) {
      dateRange = getDateRangeForPeriod('this month', refDateStr);
    } else {
      // Check for single specific date (e.g. "on 10 October 2026" or "10-10-2026")
      const singleDate = parseDateString(q, refDateStr);
      if (singleDate) {
        dateRange = { startDate: singleDate, endDate: singleDate, label: singleDate };
      } else if (/\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(q)) {
        dateRange = getDateRangeForPeriod(q, refDateStr);
      } else {
        // DEFAULT FOR GENERAL / ALL-TIME QUERIES:
        // Do NOT constrain to today! Default to All-Time so queries like:
        // "What is my total production?"
        // "How many Rani falls did I complete?"
        // "Show my completed production"
        // return total values across all records.
        dateRange = { startDate: '2000-01-01', endDate: '2099-12-31', label: 'All-Time (Overall Production)' };
      }
    }
  }

  // 5. INCOME QUERIES
  const incomeKeywords = ['income', 'earn', 'earned', 'earning', 'earnings', 'salary', 'rupee', 'rupees', '₹', 'rs', 'payout', 'payouts', 'money'];
  const hasIncomeKeyword = incomeKeywords.some(k => new RegExp(`\\b${k}\\b`, 'i').test(q));
  if (hasIncomeKeyword) {
    return {
      category: 'income',
      dateRange,
      includeColorBreakdown: breakdownRequested,
      originalQuery: query
    };
  }

  // 6. PRODUCTION QUERIES (Requires specific saree-fall production terms or color filter)
  const coreProductionTerms = [
    'fall', 'falls', 'saree fall', 'saree falls', 'bundle', 'bundles', 
    'dozen', 'dozens', 'taas', 'tas', 'फॉल', 'फॉल्स', 'उत्पादन', 'डझन'
  ];
  const hasCoreProductionTerm = coreProductionTerms.some(t => new RegExp(`\\b${t}\\b`, 'i').test(q));
  const hasColor = !!identifiedColor;
  const mentionsProduction = /\b(?:production|saree|sarees)\b/i.test(q);
  const hasCountingContext = 
    /\b(?:how many|show|total|completed|all)\b/i.test(q) &&
    /\b(?:pieces|entries|entry|records|logs)\b/i.test(q);

  const isProductionQuery = hasCoreProductionTerm || hasColor || mentionsProduction || hasCountingContext;

  if (isProductionQuery) {
    return {
      category: 'production',
      dateRange,
      colorFilter: identifiedColor,
      includeColorBreakdown: breakdownRequested,
      originalQuery: query
    };
  }

  // 7. IRRELEVANT / OUT-OF-SCOPE
  return {
    category: 'irrelevant',
    originalQuery: query
  };
};

// -------------------------------------------------------------
// Historical Rate Resolver Engine
// -------------------------------------------------------------

export const resolveHistoricalRate = (rates: Rate[], targetDate: string): { rate: number; effectiveFrom: string; rateId: string | null } => {
  if (!rates || rates.length === 0) {
    return { rate: 5.0, effectiveFrom: 'Default (No rates recorded)', rateId: null };
  }

  // Ensure rates are sorted descending by effective_from (latest date first)
  const sorted = [...rates].sort((a, b) => b.effective_from.localeCompare(a.effective_from));

  // Find the latest rate whose effective_from <= targetDate
  const active = sorted.find(r => r.effective_from <= targetDate);
  if (active) {
    return {
      rate: Number(active.rate_per_dozen),
      effectiveFrom: active.effective_from,
      rateId: active.id
    };
  }

  // If the targetDate is before all rate cards, use the oldest established rate card
  const oldest = sorted[sorted.length - 1];
  return {
    rate: Number(oldest.rate_per_dozen),
    effectiveFrom: oldest.effective_from,
    rateId: oldest.id
  };
};

// -------------------------------------------------------------
// Deterministic Business Query Executors
// -------------------------------------------------------------

export const executeBusinessQuery = (
  intent: ParsedIntent,
  data: {
    entries: ProductionEntry[];
    rates: Rate[];
    colors: Color[];
    periods: IncomePeriod[];
  }
): BusinessQueryResult => {
  const { entries, rates, colors, periods } = data;

  // 0. GREETINGS & CASUAL INTRODUCTIONS
  if (intent.category === 'greeting') {
    return {
      category: 'greeting',
      summary: 'Greeting from FallTrack AI',
      facts: { isGreeting: true },
      formattedText: `👋 **Hello! I am FallTrack AI, your smart assistant.**\n\nI can help you monitor your saree fall production bundle counts, check piece rates, calculate income, and review saved billing cycles.\n\n**Try asking me:**\n• *"How many falls did I complete today?"*\n• *"What is my current rate per dozen?"*\n• *"Calculate my income for this week."*\n• *"Show my latest billing period."*`
    };
  }

  // 0B. IRRELEVANT / OUT-OF-SCOPE QUESTIONS
  if (intent.category === 'irrelevant') {
    return {
      category: 'irrelevant',
      summary: 'Out-of-scope question asked',
      facts: { allowed: false, reason: 'Irrelevant query' },
      formattedText: `⚠️ **I can only answer questions about FallTrack**\n\nI am a specialized assistant for your Saree Fall Production & Income records. I cannot answer general knowledge questions, write code, or discuss topics outside of your saree fall ledger.\n\n**Here is what you can ask me:**\n• **Completed Production:** *"How many falls did I complete today?"*\n• **Colour Logs:** *"How many Rani falls did I complete this month?"*\n• **Piece Rates:** *"What is my current rate per dozen?"*\n• **Income Calculations:** *"Calculate my income for this week."*\n• **Billing Cycles:** *"Show my latest billing period."*\n• **Application Help:** *"How do I add a new colour?"*`,
      isUnsupported: true
    };
  }

  // 1. UNSUPPORTED ACTION
  if (intent.category === 'unsupported') {
    return {
      category: 'unsupported',
      summary: 'Unsupported action requested',
      facts: { allowed: false, reason: intent.unsupportedReason },
      formattedText: `⚠️ **Action Not Permitted in Chat**\n\n${intent.unsupportedReason || 'This action cannot be performed through the chat interface.'}`,
      isUnsupported: true
    };
  }

  // 2. APPLICATION HELP
  if (intent.category === 'help') {
    return executeHelpQuery(intent.helpTopic || 'general');
  }

  // 3. RATE QUERIES
  if (intent.category === 'rate') {
    const targetDate = intent.targetDate || formatDateStr(new Date());
    const rateInfo = resolveHistoricalRate(rates, targetDate);

    const isCurrent = targetDate >= formatDateStr(new Date());
    const summary = isCurrent 
      ? `Current production rate is ₹${rateInfo.rate.toFixed(2)} per dozen` 
      : `Rate applicable on ${targetDate} was ₹${rateInfo.rate.toFixed(2)} per dozen`;

    const formattedText = `### 🏷️ FallTrack Rate Information\n\n` +
      `- **Target Date:** ${targetDate}\n` +
      `- **Rate per Dozen:** ₹${rateInfo.rate.toFixed(2)}\n` +
      `- **Effective Since:** ${rateInfo.effectiveFrom}\n` +
      `- **Calculation Base:** 12 saree falls = 1 dozen (₹${(rateInfo.rate / 12).toFixed(4)} per individual fall).\n\n` +
      `*Note: Historical calculations always use the rate that was actively in effect on that production date.*`;

    return {
      category: 'rate',
      summary,
      facts: { targetDate, ...rateInfo },
      formattedText
    };
  }

  // 4. BILLING-PERIOD QUERIES
  if (intent.category === 'billing') {
    if (!periods || periods.length === 0) {
      return {
        category: 'billing',
        summary: 'No saved billing periods found.',
        facts: { count: 0 },
        formattedText: `### 📑 Billing Periods\n\nNo finalized billing periods have been saved in FallTrack yet.\n\nYou can review, finalize, and lock billing cycles from the **Income Tracker** page.`
      };
    }

    // Sort periods descending by end_date (latest first)
    const sorted = [...periods].sort((a, b) => b.end_date.localeCompare(a.end_date));
    const latest = sorted[0];

    const formattedText = `### 📑 Saved Billing Periods\n\n` +
      `**Latest Finalized Period: ${latest.period_name}**\n` +
      `- **Cycle Range:** ${latest.start_date} to ${latest.end_date}\n` +
      `- **Total Completed Falls:** ${latest.total_falls.toLocaleString()} falls (${(latest.total_falls / 12).toFixed(1)} dozens)\n` +
      `- **Finalized Income:** ₹${Number(latest.total_income).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n` +
      `*(Total saved billing periods in your ledger: ${sorted.length})*`;

    return {
      category: 'billing',
      summary: `Latest billing period "${latest.period_name}" has ${latest.total_falls} falls totaling ₹${Number(latest.total_income).toFixed(2)}.`,
      facts: {
        latestPeriod: latest,
        allPeriodsCount: sorted.length
      },
      formattedText
    };
  }

  // 5. PRODUCTION QUERIES
  if (intent.category === 'production') {
    const range = intent.dateRange || getDateRangeForPeriod('today');
    
    // Filter entries by date range
    let filtered = entries.filter(e => e.entry_date >= range.startDate && e.entry_date <= range.endDate);

    // Filter by color if requested
    let matchedColorObj: Color | undefined;
    if (intent.colorFilter) {
      filtered = filtered.filter(e => {
        const cName = e.color?.name || colors.find(c => c.id === e.color_id)?.name || '';
        const isMatch = matchColor(cName, intent.colorFilter!);
        if (isMatch && !matchedColorObj && e.color) {
          matchedColorObj = e.color;
        }
        return isMatch;
      });
    }

    const totalFalls = filtered.reduce((sum, e) => sum + e.quantity, 0);
    const totalDozens = totalFalls / 12;

    // Color breakdown only if requested
    const colorBreakdown: { colorName: string; quantity: number; dozens: number }[] = [];
    if (intent.includeColorBreakdown) {
      const colorMap: Record<string, number> = {};
      filtered.forEach(e => {
        const cName = e.color?.name || colors.find(c => c.id === e.color_id)?.name || 'Unspecified';
        colorMap[cName] = (colorMap[cName] || 0) + e.quantity;
      });
      Object.entries(colorMap).forEach(([colorName, quantity]) => {
        colorBreakdown.push({
          colorName,
          quantity,
          dozens: Number((quantity / 12).toFixed(1))
        });
      });
      colorBreakdown.sort((a, b) => b.quantity - a.quantity);
    }

    let formattedText = `### 🧵 Completed Production Summary\n\n` +
      `- **Period:** ${range.label}\n` +
      (intent.colorFilter ? `- **Color Filter:** ${matchedColorObj ? matchedColorObj.name : intent.colorFilter}\n` : '') +
      `- **Total Completed Falls:** **${totalFalls.toLocaleString()}** falls\n` +
      `- **Dozens Equivalent:** **${totalDozens.toFixed(1)}** dozens *(12 falls = 1 dozen)*\n` +
      `- **Logged Entries:** ${filtered.length} entries\n`;

    if (intent.includeColorBreakdown && colorBreakdown.length > 0) {
      formattedText += `\n**Breakdown by Colour:**\n` +
        colorBreakdown.map(c => `• **${c.colorName}**: ${c.quantity.toLocaleString()} falls (${c.dozens} dozens)`).join('\n') + '\n';
    } else if (filtered.length === 0) {
      formattedText += `\n*No completed production entries were recorded for this period.*`;
    }

    return {
      category: 'production',
      summary: `Completed ${totalFalls.toLocaleString()} falls (${totalDozens.toFixed(1)} dozens) for ${range.label}.`,
      facts: {
        dateRange: range,
        totalFalls,
        totalDozens,
        entryCount: filtered.length,
        colorBreakdown: intent.includeColorBreakdown ? colorBreakdown : undefined
      },
      formattedText
    };
  }

  // 6. INCOME QUERIES
  if (intent.category === 'income') {
    const range = intent.dateRange || getDateRangeForPeriod('today');
    const filtered = entries.filter(e => e.entry_date >= range.startDate && e.entry_date <= range.endDate);

    // Group entries by date to accurately apply historical rates per date
    const dateGroups: Record<string, number> = {};
    filtered.forEach(e => {
      dateGroups[e.entry_date] = (dateGroups[e.entry_date] || 0) + e.quantity;
    });

    let totalFalls = 0;
    let totalIncome = 0;
    const dateMathBreakdown: {
      date: string;
      falls: number;
      dozens: number;
      ratePerDozen: number;
      income: number;
    }[] = [];

    const sortedDates = Object.keys(dateGroups).sort();
    sortedDates.forEach(date => {
      const dayFalls = dateGroups[date];
      const rateInfo = resolveHistoricalRate(rates, date);
      const dayDozens = dayFalls / 12;
      const dayIncome = (dayFalls / 12) * rateInfo.rate;

      totalFalls += dayFalls;
      totalIncome += dayIncome;

      dateMathBreakdown.push({
        date,
        falls: dayFalls,
        dozens: Number(dayDozens.toFixed(2)),
        ratePerDozen: rateInfo.rate,
        income: Number(dayIncome.toFixed(2))
      });
    });

    const totalDozens = totalFalls / 12;

    let formattedText = `### 💰 Production Income Calculation\n\n` +
      `- **Period:** ${range.label}\n` +
      `- **Total Completed Falls:** **${totalFalls.toLocaleString()}** falls\n` +
      `- **Total Dozens:** **${totalDozens.toFixed(2)}** dozens\n` +
      `- **Total Earned Income:** **₹${totalIncome.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}**\n\n` +
      `**Calculation Formula:**\n` +
      `\`Income = (Completed Falls ÷ 12) × Rate per Dozen\`\n\n`;

    if (dateMathBreakdown.length > 0) {
      formattedText += `**Date-by-Date Audit & Historical Rates:**\n`;
      dateMathBreakdown.forEach(d => {
        formattedText += `• **${d.date}:** (${d.falls.toLocaleString()} ÷ 12) × ₹${d.ratePerDozen.toFixed(2)} = **₹${d.income.toFixed(2)}**\n`;
      });
    } else {
      formattedText += `*No production records found in this date range to calculate income.*`;
    }

    return {
      category: 'income',
      summary: `Total income for ${range.label} is ₹${totalIncome.toFixed(2)} based on ${totalFalls} completed falls.`,
      facts: {
        dateRange: range,
        totalFalls,
        totalDozens,
        totalIncome: Number(totalIncome.toFixed(2)),
        breakdown: dateMathBreakdown
      },
      formattedText
    };
  }

  // Fallback
  return {
    category: 'general',
    summary: 'Here is what FallTrack can help you with.',
    facts: {},
    formattedText: `I can help you check your completed saree fall production, current & historical rates, calculated income, and saved billing periods.\n\nTry asking:\n- *"How many falls did I complete today?"*\n- *"What is my current rate per dozen?"*\n- *"Calculate my income for this week."*\n- *"Show my latest billing period."*`
  };
};

// -------------------------------------------------------------
// Approved Application Help Responses
// -------------------------------------------------------------

function executeHelpQuery(topic: string): BusinessQueryResult {
  switch (topic) {
    case 'add_color':
      return {
        category: 'help',
        summary: 'How to add a new saree fall color in FallTrack.',
        facts: { topic },
        formattedText: `### 🎨 Adding a New Color in FallTrack\n\nYou can add a color in two ways:\n\n1. **From Color Management:**\n   - Navigate to the **Color Management** tab from the left sidebar.\n   - Enter the Marathi colour name in the text box (e.g. *राणी*, *केशरी*, *गुलाबी*).\n   - Click **Add Color**.\n\n2. **Directly While Logging Daily Production:**\n   - On the **Daily Entry** page, type the color name in the color select input.\n   - If the color doesn't exist yet, click the *"Add new color"* button that appears in the dropdown.\n\n*Note: Color names are preserved exactly as entered in Marathi Devanagari.*`
      };

    case 'daily_entry':
      return {
        category: 'help',
        summary: 'How to log daily production in FallTrack.',
        facts: { topic },
        formattedText: `### 📝 Logging Daily Production Entries\n\n1. Open the **Daily Entry** tab.\n2. Confirm or select the **Production Date** (defaults to today).\n3. In each row, select or search for the saree fall colour (supports Marathi phonetic search, e.g. typing *rani* finds *राणी*).\n4. Enter the completed bundle quantity.\n5. Press **ENTER** to automatically jump to and create the next row for quick keyboard entry.\n6. Click **Save Production Logs**.\n\n*Tip: Unsaved entries are automatically stored in a local draft so your inputs aren't lost on reload.*`
      };

    case 'rate_update':
      return {
        category: 'help',
        summary: 'How to update production piece rates.',
        facts: { topic },
        formattedText: `### 🏷️ Updating Your Piece-Rate\n\n1. Go to **Rate Management** from the sidebar.\n2. Enter the new **Rate per Dozen** in ₹ (e.g. *5.00* or *5.50*).\n3. Choose the **Effective From** date when this rate becomes active.\n4. Click **Save Rate Card**.\n\n*Auditing Rule: Past production dates will automatically continue using the historical rate that was active on that date, preserving your past earnings calculations accurately.*`
      };

    case 'lock_policy':
      return {
        category: 'help',
        summary: 'Why past-day entries cannot be modified.',
        facts: { topic },
        formattedText: `### 🔒 Why Can't I Edit Yesterday's Production?\n\n**Same-Day Editing Rule:**\n- Production entries can only be modified or deleted on the **same day** they are recorded.\n- Once the production date has passed, records become **read-only** to maintain strict ledger integrity and prevent discrepancies in finalized historical earnings.\n- Today's entries can be edited or deleted by clicking the pencil or trash icons on the **Daily Records** page.`
      };

    case 'income_formula':
    default:
      return {
        category: 'help',
        summary: 'How FallTrack calculates production income.',
        facts: { topic },
        formattedText: `### 🧮 How Income is Calculated in FallTrack\n\n1. **Standard Unit:** 12 saree falls = 1 dozen.\n2. **Formula:**\n   \`Income = (Completed Falls ÷ 12) × Rate per Dozen\`\n3. **Historical Accuracy:** For every production date, FallTrack resolves the exact piece-rate that was active on that day.\n4. **Example:** If 48,000 falls are completed at an active rate of ₹5.00/dozen:\n   \`(48,000 ÷ 12) × ₹5.00 = 4,000 dozens × ₹5.00 = ₹20,000.00\``
      };
  }
}
