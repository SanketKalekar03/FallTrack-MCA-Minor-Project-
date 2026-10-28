/**
 * FallTrack AI Chatbot - Supabase Edge Function
 * 
 * Secure, authenticated chatbot backend for Saree Fall Production & Income tracking.
 * - Authenticates user session using Supabase Auth JWT.
 * - Enforces read-only deterministic business query calculations.
 * - Calls Gemini API with verified factual payloads.
 * - Handles rate limits, quota exhaustion, and graceful fallbacks.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import {
  analyzeIntent,
  resolveHistoricalRate,
  formatDateStr,
  RateRecord,
  ProductionEntryRecord,
  IncomePeriodRecord
} from "./businessQueries.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  // 1. Handle CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  try {
    // 2. Validate Supabase Auth Token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized: Missing or invalid Authorization header." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(JSON.stringify({ error: "Server configuration error: Supabase environment variables missing." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Initialize authenticated Supabase client for this user request
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid or expired user session." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const userId = user.id;

    // 3. Parse and Validate Request Payload
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON request body." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const rawMessage = body.message;
    const clientDate = typeof body.clientDate === "string" ? body.clientDate : formatDateStr(new Date());

    if (!rawMessage || typeof rawMessage !== "string" || rawMessage.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Message cannot be empty." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const trimmedMessage = rawMessage.trim();
    if (trimmedMessage.length > 500) {
      return new Response(JSON.stringify({ error: "Message exceeds maximum allowed length of 500 characters." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 4. Intent Analysis & Business Rules Enforcement
    const intent = analyzeIntent(trimmedMessage, clientDate);

    // 4A. Irrelevant / Out-of-Scope Questions
    if (intent.category === "irrelevant") {
      return new Response(JSON.stringify({
        answer: `⚠️ **I can only answer questions about FallTrack**\n\nI am a specialized assistant for your Saree Fall Production & Income records. I cannot answer general knowledge questions, write code, or discuss topics outside of your saree fall ledger.\n\n**Here is what you can ask me:**\n• **Completed Production:** *"How many falls did I complete today?"*\n• **Colour Logs:** *"How many Rani falls did I complete this month?"*\n• **Piece Rates:** *"What is my current rate per dozen?"*\n• **Income Calculations:** *"Calculate my income for this week."*\n• **Billing Cycles:** *"Show my latest billing period."*\n• **Application Help:** *"How do I add a new colour?"*`,
        facts: { allowed: false, reason: "Out-of-scope query" },
        source: "deterministic"
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 4B. Casual Greetings & Bot Capabilities
    if (intent.category === "greeting") {
      return new Response(JSON.stringify({
        answer: `👋 **Hello! I am FallTrack AI, your smart assistant.**\n\nI can help you monitor your saree fall production bundle counts, check piece rates, calculate income, and review saved billing cycles.\n\n**Try asking me:**\n• *"How many falls did I complete today?"*\n• *"What is my current rate per dozen?"*\n• *"Calculate my income for this week."*\n• *"Show my latest billing period."*`,
        facts: { isGreeting: true },
        source: "deterministic"
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 4C. Strictly Excluded Actions: Reject gracefully
    if (intent.isUnsupported) {
      return new Response(JSON.stringify({
        answer: `⚠️ **Action Not Available in Chat**\n\n${intent.unsupportedReason}`,
        facts: { allowed: false, reason: intent.unsupportedReason },
        source: "deterministic"
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 4B. Help Topics
    if (intent.category === "help") {
      const helpAnswers: Record<string, string> = {
        add_color: "### 🎨 Adding a New Color in FallTrack\n\nYou can add saree fall colors in two ways:\n1. **Color Management Page:** Navigate to **Color Management** in the sidebar, enter the Marathi colour name (e.g. *राणी*, *केशरी*, *गुलाबी*), and click **Add Color**.\n2. **Directly in Daily Entry:** While entering logs on the **Daily Entry** tab, search for the color; if it doesn't exist, click the inline *Add new color* button.\n\n*All color names are preserved exactly as entered in Marathi Devanagari.*",
        daily_entry: "### 📝 Logging Daily Production Entries\n\n1. Go to the **Daily Entry** page.\n2. Verify the production date.\n3. Type or select the colour (supports phonetic search, e.g. typing *rani* finds *राणी*).\n4. Enter the completed saree fall bundle quantity.\n5. Press **ENTER** on the quantity field to quickly create and focus the next row.\n6. Click **Save Production Logs**.",
        rate_update: "### 🏷️ Updating Piece-Rates\n\n1. Navigate to **Rate Management** from the sidebar.\n2. Enter the new **Rate per Dozen** in ₹ (e.g. ₹5.00 or ₹5.50).\n3. Set the **Effective From** date for when this rate takes effect.\n4. Click **Save Rate Card**.\n\n*Historical rates are always preserved: older production entries automatically use the rate applicable to their specific date.*",
        lock_policy: "### 🔒 Why Can't I Edit Yesterday's Production?\n\n**Same-Day Editing Rule:**\n- Production entries can only be edited or deleted on the **same day** they are recorded.\n- Once midnight passes, entries are locked as read-only to safeguard historical ledger accuracy and finalized earnings calculations.\n- Today's entries can be edited or deleted using the pencil/trash icons in **Daily Records**.",
        income_formula: "### 🧮 How Income is Calculated in FallTrack\n\n1. **Standard Business Unit:** 12 saree falls = 1 dozen.\n2. **Formula:** `Income = (Completed Falls ÷ 12) × Rate per Dozen`\n3. **Historical Rates:** Each production date's earnings are calculated using the piece-rate actively effective on that date.\n4. **Example:** 48,000 falls at ₹5.00/dozen = `(48,000 ÷ 12) × ₹5.00 = 4,000 dozens × ₹5.00 = ₹20,000.00`."
      };

      const answer = helpAnswers[intent.helpTopic || "income_formula"] || helpAnswers.income_formula;
      return new Response(JSON.stringify({
        answer,
        facts: { topic: intent.helpTopic },
        source: "deterministic"
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 5. Execute Deterministic Database Queries
    let verifiedFacts: Record<string, any> = {};
    let deterministicFallback = "";

    // 5A. RATE QUERY
    if (intent.category === "rate") {
      const targetDate = intent.targetDate || clientDate;
      const { data: ratesData, error: rateErr } = await supabase
        .from("rates")
        .select("id, rate_per_dozen, effective_from")
        .eq("user_id", userId)
        .order("effective_from", { ascending: false });

      if (rateErr) throw rateErr;

      const rateInfo = resolveHistoricalRate(ratesData || [], targetDate);
      const isCurrent = targetDate >= clientDate;

      verifiedFacts = {
        queryType: "rate",
        targetDate,
        ratePerDozen: rateInfo.rate,
        effectiveFrom: rateInfo.effectiveFrom,
        isCurrentRate: isCurrent,
        dozenRule: "12 saree falls = 1 dozen"
      };

      deterministicFallback = `### 🏷️ FallTrack Rate Information\n\n` +
        `- **Applicable Date:** ${targetDate}\n` +
        `- **Rate per Dozen:** **₹${rateInfo.rate.toFixed(2)}**\n` +
        `- **Effective Since:** ${rateInfo.effectiveFrom}\n` +
        `- **Rule:** 12 saree falls = 1 dozen (equivalent to ₹${(rateInfo.rate / 12).toFixed(4)} per individual fall).\n\n` +
        `*Historical calculations always use the rate actively in effect on each specific production date.*`;
    }

    // 5B. BILLING PERIODS QUERY
    else if (intent.category === "billing") {
      const { data: periodsData, error: periodErr } = await supabase
        .from("income_periods")
        .select("id, period_name, start_date, end_date, total_falls, total_income")
        .eq("user_id", userId)
        .order("end_date", { ascending: false });

      if (periodErr) throw periodErr;

      const periods = periodsData || [];
      if (periods.length === 0) {
        verifiedFacts = { queryType: "billing", count: 0, latestPeriod: null };
        deterministicFallback = `### 📑 Billing Periods\n\nNo finalized billing periods have been saved in FallTrack yet.\n\nYou can review, calculate, and finalize billing cycles under the **Income Tracker** tab.`;
      } else {
        const latest = periods[0];
        verifiedFacts = {
          queryType: "billing",
          count: periods.length,
          latestPeriod: {
            name: latest.period_name,
            startDate: latest.start_date,
            endDate: latest.end_date,
            totalFalls: latest.total_falls,
            totalDozens: Number((latest.total_falls / 12).toFixed(1)),
            totalIncome: Number(latest.total_income)
          }
        };

        deterministicFallback = `### 📑 Saved Billing Periods\n\n` +
          `**Latest Finalized Period: ${latest.period_name}**\n` +
          `- **Date Range:** ${latest.start_date} to ${latest.end_date}\n` +
          `- **Completed Production:** **${latest.total_falls.toLocaleString()}** falls (${(latest.total_falls / 12).toFixed(1)} dozens)\n` +
          `- **Saved Income Payout:** **₹${Number(latest.total_income).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}**\n\n` +
          `*(Total billing periods saved: ${periods.length})*`;
      }
    }

    // 5C. PRODUCTION QUERY
    else if (intent.category === "production") {
      const range = intent.dateRange!;
      let query = supabase
        .from("production_entries")
        .select("id, entry_date, quantity, color_id, colors(id, name)")
        .eq("user_id", userId)
        .gte("entry_date", range.startDate)
        .lte("entry_date", range.endDate);

      const { data: entriesData, error: entriesErr } = await query;
      if (entriesErr) throw entriesErr;

      let entries = (entriesData || []).map((e: any) => ({
        id: e.id,
        entry_date: e.entry_date,
        quantity: e.quantity,
        color_id: e.color_id,
        colorName: e.colors?.name || "Unspecified"
      }));

      // Filter by color if specified
      if (intent.colorFilter) {
        entries = entries.filter(e => e.colorName === intent.colorFilter);
      }

      const totalFalls = entries.reduce((acc, curr) => acc + curr.quantity, 0);
      const totalDozens = Number((totalFalls / 12).toFixed(1));

      // Color breakdown if requested
      const colorBreakdown: { color: string; quantity: number; dozens: number }[] = [];
      if (intent.includeColorBreakdown) {
        const colorMap: Record<string, number> = {};
        entries.forEach(e => {
          colorMap[e.colorName] = (colorMap[e.colorName] || 0) + e.quantity;
        });
        Object.entries(colorMap).forEach(([color, qty]) => {
          colorBreakdown.push({
            color,
            quantity: qty,
            dozens: Number((qty / 12).toFixed(1))
          });
        });
        colorBreakdown.sort((a, b) => b.quantity - a.quantity);
      }

      verifiedFacts = {
        queryType: "production",
        period: range.label,
        startDate: range.startDate,
        endDate: range.endDate,
        colorFilter: intent.colorFilter || null,
        totalFalls,
        totalDozens,
        loggedEntriesCount: entries.length,
        colorBreakdown: intent.includeColorBreakdown ? colorBreakdown : undefined
      };

      deterministicFallback = `### 🧵 Completed Production Summary\n\n` +
        `- **Period:** ${range.label}\n` +
        (intent.colorFilter ? `- **Color:** ${intent.colorFilter}\n` : '') +
        `- **Total Completed Falls:** **${totalFalls.toLocaleString()}** falls\n` +
        `- **Dozens Equivalent:** **${totalDozens}** dozens *(12 falls = 1 dozen)*\n` +
        `- **Logged Rows:** ${entries.length}\n`;

      if (intent.includeColorBreakdown && colorBreakdown.length > 0) {
        deterministicFallback += `\n**Breakdown by Colour:**\n` +
          colorBreakdown.map(c => `• **${c.color}**: ${c.quantity.toLocaleString()} falls (${c.dozens} dozens)`).join('\n') + '\n';
      } else if (entries.length === 0) {
        deterministicFallback += `\n*No production entries recorded for this period.*`;
      }
    }

    // 5D. INCOME QUERY
    else if (intent.category === "income") {
      const range = intent.dateRange!;

      // 1. Fetch entries in range
      const { data: entriesData, error: entriesErr } = await supabase
        .from("production_entries")
        .select("id, entry_date, quantity")
        .eq("user_id", userId)
        .gte("entry_date", range.startDate)
        .lte("entry_date", range.endDate);

      if (entriesErr) throw entriesErr;

      // 2. Fetch rates
      const { data: ratesData, error: ratesErr } = await supabase
        .from("rates")
        .select("id, rate_per_dozen, effective_from")
        .eq("user_id", userId)
        .order("effective_from", { ascending: false });

      if (ratesErr) throw ratesErr;

      // Group falls by date to apply historical rates per date
      const dateMap: Record<string, number> = {};
      (entriesData || []).forEach((e: any) => {
        dateMap[e.entry_date] = (dateMap[e.entry_date] || 0) + e.quantity;
      });

      let totalFalls = 0;
      let totalIncome = 0;
      const dateBreakdown: { date: string; falls: number; dozens: number; rate: number; income: number }[] = [];

      const sortedDates = Object.keys(dateMap).sort();
      sortedDates.forEach(date => {
        const falls = dateMap[date];
        const rateInfo = resolveHistoricalRate(ratesData || [], date);
        const dozens = falls / 12;
        const income = dozens * rateInfo.rate;

        totalFalls += falls;
        totalIncome += income;

        dateBreakdown.push({
          date,
          falls,
          dozens: Number(dozens.toFixed(2)),
          rate: rateInfo.rate,
          income: Number(income.toFixed(2))
        });
      });

      const totalDozens = Number((totalFalls / 12).toFixed(2));
      const roundedIncome = Number(totalIncome.toFixed(2));

      verifiedFacts = {
        queryType: "income",
        period: range.label,
        startDate: range.startDate,
        endDate: range.endDate,
        totalFalls,
        totalDozens,
        totalIncome: roundedIncome,
        formula: "(completedFalls / 12) * ratePerDozen",
        dailyBreakdown: dateBreakdown
      };

      deterministicFallback = `### 💰 Production Income Calculation\n\n` +
        `- **Period:** ${range.label}\n` +
        `- **Total Completed Falls:** **${totalFalls.toLocaleString()}** falls\n` +
        `- **Total Dozens:** **${totalDozens}** dozens\n` +
        `- **Total Earned Income:** **₹${roundedIncome.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}**\n\n` +
        `**Calculation Formula:**\n` +
        `\`Income = (Completed Falls ÷ 12) × Rate per Dozen\`\n\n`;

      if (dateBreakdown.length > 0) {
        deterministicFallback += `**Date-by-Date Historical Rates & Math:**\n`;
        dateBreakdown.forEach(d => {
          deterministicFallback += `• **${d.date}:** (${d.falls.toLocaleString()} ÷ 12) × ₹${d.rate.toFixed(2)} = **₹${d.income.toFixed(2)}**\n`;
        });
      } else {
        deterministicFallback += `*No production records found in this date range to calculate income.*`;
      }
    }

    // 6. Integrate with Gemini API (with Graceful Fallback)
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    const geminiModel = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";

    if (!geminiApiKey) {
      // Gemini key not set in Edge Function secrets: return deterministic result directly
      return new Response(JSON.stringify({
        answer: deterministicFallback,
        facts: verifiedFacts,
        source: "deterministic"
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Call Gemini API securely
    try {
      const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;

      const systemPrompt = `You are "FallTrack Assistant", a concise, professional copilot for the FallTrack Saree Fall Production & Income Management System.
Explain the provided verified business facts to the manager clearly in English.
STRICT RULES:
1. Base your answer EXCLUSIVELY on the verified facts provided below. Do not guess, assume, or invent numbers, rates, dates, or calculations.
2. 12 falls = 1 dozen. Income = (completed falls / 12) * rate per dozen.
3. Keep Marathi saree fall colour names intact and unchanged (e.g. राणी, केशरी, पांढरा).
4. State currency in Indian Rupees (₹).
5. Never claim features exist that are not in the facts (e.g. no worker tracking, no stock inventory).
6. Be friendly, structured, and easy to read with bullet points.
7. If the user asks general trivia, jokes, coding, or questions unrelated to FallTrack saree fall production, politely state that you can only assist with FallTrack production, rates, and income records.`;

      const promptPayload = {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${systemPrompt}\n\nUser Question: "${trimmedMessage}"\n\nVerified Facts from Database:\n${JSON.stringify(verifiedFacts, null, 2)}`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 600
        }
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

      const aiResponse = await fetch(geminiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(promptPayload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.warn(`Gemini API returned status ${aiResponse.status}: ${errorText}`);

        // If rate limit / quota exhausted / error: return deterministic fallback cleanly
        return new Response(JSON.stringify({
          answer: deterministicFallback + "\n\n*(Verified directly from FallTrack database records)*",
          facts: verifiedFacts,
          source: "deterministic"
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const aiData = await aiResponse.json();
      const candidateText = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!candidateText) {
        return new Response(JSON.stringify({
          answer: deterministicFallback,
          facts: verifiedFacts,
          source: "deterministic"
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({
        answer: candidateText,
        facts: verifiedFacts,
        source: "ai"
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (aiErr: any) {
      console.warn("Gemini API invocation error, using deterministic calculation:", aiErr);
      return new Response(JSON.stringify({
        answer: deterministicFallback + "\n\n*(Verified directly from FallTrack database records)*",
        facts: verifiedFacts,
        source: "deterministic"
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

  } catch (err: any) {
    console.error("Unhandled Edge Function error:", err);
    return new Response(JSON.stringify({
      error: "An unexpected error occurred while processing your request. Please try again."
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
