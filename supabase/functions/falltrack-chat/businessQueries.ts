/**
 * FallTrack Edge Function Deterministic Business Logic & Query Processor
 * 
 * Formulates verified production, rate, income, and billing queries.
 * Deno compatible.
 */

export interface RateRecord {
  id: string;
  rate_per_dozen: number;
  effective_from: string;
  user_id?: string;
}

export interface ProductionEntryRecord {
  id: string;
  entry_date: string;
  color_id: string;
  quantity: number;
  user_id?: string;
  color?: { id: string; name: string };
}

export interface IncomePeriodRecord {
  id: string;
  period_name: string;
  start_date: string;
  end_date: string;
  total_falls: number;
  total_income: number;
  user_id?: string;
}

// -------------------------------------------------------------
// Intent & Date Parsing
// -------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');

export const formatDateStr = (date: Date): string => {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const parseDateString = (input: string, referenceDateStr?: string): string | null => {
  const refDate = referenceDateStr ? new Date(referenceDateStr) : new Date();
  const lower = input.toLowerCase().trim();

  // 1. Explicit Relative keywords
  if (/\byesterday\b/i.test(lower)) {
    const d = new Date(refDate);
    d.setDate(d.getDate() - 1);
    return formatDateStr(d);
  }
  if (/\btoday\b/i.test(lower)) {
    return formatDateStr(refDate);
  }

  // 2. YYYY-MM-DD
  const isoMatch = lower.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${pad(parseInt(isoMatch[2], 10))}-${pad(parseInt(isoMatch[3], 10))}`;
  }

  // 3. DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = lower.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${pad(parseInt(dmyMatch[2], 10))}-${pad(parseInt(dmyMatch[1], 10))}`;
  }

  // 4. Natural dates with strict word boundaries
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

  // Explicit All-Time keywords
  if (lower.includes('all time') || lower.includes('overall') || lower.includes('total') || lower.includes('all') || lower.includes('so far') || lower.includes('history')) {
    return { startDate: '2000-01-01', endDate: '2099-12-31', label: 'All-Time (Overall Production)' };
  }

  if (/\btoday\b/i.test(lower)) {
    const d = formatDateStr(refDate);
    return { startDate: d, endDate: d, label: `Today (${d})` };
  }

  if (/\byesterday\b/i.test(lower)) {
    const d = new Date(refDate);
    d.setDate(d.getDate() - 1);
    const s = formatDateStr(d);
    return { startDate: s, endDate: s, label: `Yesterday (${s})` };
  }

  if (/\b(?:this\s+week|current\s+week|week)\b/i.test(lower)) {
    const d = new Date(refDate);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const startOfWeek = new Date(d.setDate(diff));
    const s = formatDateStr(startOfWeek);
    const e = formatDateStr(refDate);
    return { startDate: s, endDate: e, label: `This Week (${s} to ${e})` };
  }

  if (/\b(?:this\s+month|current\s+month)\b/i.test(lower)) {
    const year = refDate.getFullYear();
    const month = refDate.getMonth();
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0);
    const s = formatDateStr(startOfMonth);
    const e = formatDateStr(endOfMonth);
    const monthName = refDate.toLocaleString('default', { month: 'long' });
    return { startDate: s, endDate: e, label: `${monthName} ${year}` };
  }

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

  // Default fallback when no specific period is mentioned
  return { startDate: '2000-01-01', endDate: '2099-12-31', label: 'All-Time (Overall Production)' };
};

// -------------------------------------------------------------
// Historical Rate Resolver
// -------------------------------------------------------------

export const resolveHistoricalRate = (rates: RateRecord[], targetDate: string): { rate: number; effectiveFrom: string } => {
  if (!rates || rates.length === 0) {
    return { rate: 5.0, effectiveFrom: 'Default (No rates recorded)' };
  }

  const sorted = [...rates].sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  const active = sorted.find(r => r.effective_from <= targetDate);
  if (active) {
    return { rate: Number(active.rate_per_dozen), effectiveFrom: active.effective_from };
  }

  const oldest = sorted[sorted.length - 1];
  return { rate: Number(oldest.rate_per_dozen), effectiveFrom: oldest.effective_from };
};

// -------------------------------------------------------------
// Intent Engine
// -------------------------------------------------------------

export interface IntentAnalysis {
  category: 'production' | 'rate' | 'income' | 'billing' | 'help' | 'unsupported' | 'greeting' | 'irrelevant';
  isUnsupported: boolean;
  unsupportedReason?: string;
  helpTopic?: string;
  targetDate?: string;
  dateRange?: { startDate: string; endDate: string; label: string };
  colorFilter?: string;
  includeColorBreakdown?: boolean;
}

export const analyzeIntent = (query: string, clientDate?: string): IntentAnalysis => {
  const q = query.trim().toLowerCase();
  const refDateStr = clientDate || formatDateStr(new Date());

  // Greetings & casual pleasantries
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
      isUnsupported: false
    };
  }

  // 2. Unsupported checks & mutation guardrail
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
    let reason = 'FallTrack AI is a read-only assistant and cannot perform direct data modifications.';
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
      isUnsupported: true,
      unsupportedReason: reason
    };
  }

  // Help queries
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
        isUnsupported: false,
        helpTopic: topic
      };
    }
  }

  // Billing periods
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
    return { category: 'billing', isUnsupported: false };
  }

  // Rate queries
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
      isUnsupported: false,
      targetDate: specificDate || refDateStr
    };
  }

  // Color breakdown requested
  const includeColorBreakdown =
    q.includes('break down') ||
    q.includes('breakdown') ||
    q.includes('by colour') ||
    q.includes('by color') ||
    q.includes('color wise') ||
    q.includes('colour wise');

  // Specific color matching
  const knownColors: { [key: string]: string } = {
    'rani': 'राणी',
    'राणी': 'राणी',
    'lal': 'लाल',
    'लाल': 'लाल',
    'pandhra': 'पांढरा',
    'पांढरा': 'पांढरा',
    'white': 'पांढरा',
    'keshari': 'केशरी',
    'kesari': 'केशरी',
    'केशरी': 'केशरी',
    'nila': 'निळा',
    'निळा': 'निळा',
    'blue': 'निळा',
    'hirva': 'हिरवा',
    'हिरवा': 'हिरवा',
    'green': 'हिरवा',
    'pivla': 'पिवळा',
    'पिवळा': 'पिवळा',
    'yellow': 'पिवळा',
    'gulabi': 'गुलाबी',
    'गुलाबी': 'गुलाबी',
    'pink': 'गुलाबी',
    'kala': 'काळा',
    'काळा': 'काळा',
    'black': 'काळा',
    'rajwadi': 'राजवाडी',
    'राजवाडी': 'राजवाडी',
    'morpankhi': 'मोरपंखी',
    'मोरपंखी': 'मोरपंखी',
    'jambhla': 'जांभळा',
    'जांभळा': 'जांभळा'
  };

  let colorFilter: string | undefined;
  for (const [key, marathiVal] of Object.entries(knownColors)) {
    const reg = new RegExp(`\\b${key}\\b`, 'i');
    if (reg.test(q)) {
      colorFilter = marathiVal;
      break;
    }
  }

  // Date range detection
  const rangeMatch = q.match(/(?:between|from)\s+([a-zA-Z0-9\s,-]+?)\s+(?:and|to)\s+([a-zA-Z0-9\s,-]+)/i);
  let dateRange: { startDate: string; endDate: string; label: string } | undefined;

  if (rangeMatch) {
    const s = parseDateString(rangeMatch[1], refDateStr);
    const e = parseDateString(rangeMatch[2], refDateStr);
    if (s && e) {
      dateRange = {
        startDate: s <= e ? s : e,
        endDate: s <= e ? e : s,
        label: `${s} to ${e}`
      };
    }
  }

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

  // Income queries
  const incomeKeywords = ['income', 'earn', 'earned', 'earning', 'earnings', 'salary', 'rupee', 'rupees', '₹', 'rs', 'payout', 'payouts', 'money'];
  const hasIncomeKeyword = incomeKeywords.some(k => new RegExp(`\\b${k}\\b`, 'i').test(q));
  if (hasIncomeKeyword) {
    return {
      category: 'income',
      isUnsupported: false,
      dateRange,
      includeColorBreakdown
    };
  }

  // Production queries (Requires specific saree-fall production terms or color filter)
  const coreProductionTerms = [
    'fall', 'falls', 'saree fall', 'saree falls', 'bundle', 'bundles', 
    'dozen', 'dozens', 'taas', 'tas', 'फॉल', 'फॉल्स', 'उत्पादन', 'डझन'
  ];
  const hasCoreProductionTerm = coreProductionTerms.some(t => new RegExp(`\\b${t}\\b`, 'i').test(q));
  const hasColor = !!colorFilter;
  const mentionsProduction = /\b(?:production|saree|sarees)\b/i.test(q);
  const hasCountingContext = 
    /\b(?:how many|show|total|completed|all)\b/i.test(q) &&
    /\b(?:pieces|entries|entry|records|logs)\b/i.test(q);

  const isProductionQuery = hasCoreProductionTerm || hasColor || mentionsProduction || hasCountingContext;

  if (isProductionQuery) {
    return {
      category: 'production',
      isUnsupported: false,
      dateRange,
      colorFilter,
      includeColorBreakdown
    };
  }

  // Irrelevant / Out-of-scope query
  return {
    category: 'irrelevant',
    isUnsupported: true,
    unsupportedReason: 'I can only assist with FallTrack Saree Fall Production & Income records, rates, and billing.'
  };
};
