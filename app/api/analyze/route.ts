import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

export async function POST(req: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'text' field." },
        { status: 400 }
      );
    }

    const prompt = `You are an Expert Process Analyst and Performance Reviewer.
Your task is to analyze the following completed incident, task, or log text.

ANALYTICAL TASKS:
1. Time Calculation: Scan the text for any clear "Start/Creation" timestamps and "End/Completion/Closed" timestamps. Calculate the total overall time spent to resolve or complete the task (e.g., "2 days, 4 hours").
2. Resolution Summary: Identify the core issue/objective and the exact steps or actions that led to the final resolution or outcome.
3. Pointer Extraction: Identify key technical, situational, or environmental details that provide clarity on what the situation was and how it was handled.
4. Process Evaluation: Identify bottlenecks or inefficiencies in the workflow. What specific steps could the assigned individual or team have taken to achieve this outcome faster?

RULES FOR 'actionableInsights' ARRAY:
- NEVER write long paragraphs. Keep pointers short, crisp, and highly memorable.
- ALWAYS include key details (specific names, errors, missing items, exact misconfigurations).
- The first 3 items MUST be situational context pointers providing clarity.
- The last 2 items MUST be strictly focused on Workflow Optimization and actionable steps for faster future execution.

Text to analyze:
"${text}"`;

    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            assigneeName: {
              type: "STRING",
              description:
                "Extracted name of the person handling the task, or 'Unknown'",
            },
            outcomeStatus: {
              type: "STRING",
              description: "Successful, Neutral, Unsuccessful, or Escalated",
            },
            executionQuality: {
              type: "STRING",
              description: "Excellent, Good, Standard, or Poor",
            },
            efficiencyScore: {
              type: "NUMBER",
              description:
                "0 to 100 representing workflow efficiency (100 = fastest possible)",
            },
            executiveSummary: {
              type: "STRING",
              description:
                "Format: 'Issue: [Core problem]. Resolution: [Brief fix summary]. Time Spent: [Calculated duration].'",
            },
            actionableInsights: {
              type: "ARRAY",
              items: { type: "STRING" },
              description:
                "Exactly 5 items: 3 context pointers then 2 workflow optimizations",
            },
          },
          required: [
            "assigneeName",
            "outcomeStatus",
            "executionQuality",
            "efficiencyScore",
            "executiveSummary",
            "actionableInsights",
          ],
        },
      },
    };

    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `Gemini API ${res.status}: ${errText}` },
        { status: res.status }
      );
    }

    const json = await res.json();
    const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const analysis = JSON.parse(raw);

    return NextResponse.json(analysis);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
