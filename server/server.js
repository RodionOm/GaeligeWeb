import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import OpenAI from "openai";
import { jsonrepair } from "jsonrepair";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Simple in-memory rate limiting per IP (for demo/hackathon). Replace with Redis in prod.
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 20;
const requestCounters = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const record = requestCounters.get(ip) || { count: 0, start: now };

  if (now - record.start > RATE_LIMIT_WINDOW_MS) {
    record.count = 1;
    record.start = now;
  } else {
    record.count += 1;
  }

  requestCounters.set(ip, record);
  return record.count > RATE_LIMIT_MAX;
}

function sanitizeAIOutput(text) {
  if (typeof text !== "string") return "";
  const cleaned = text.trim();

  // Check for ```json ... ```
  const jsonBlockMatch = cleaned.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) {
    return jsonBlockMatch[1].trim();
  }

  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
      return cleaned.slice(firstBrace, lastBrace + 1);
    }
  }

  return cleaned;
}

function fixJson(jsonString) {
  // Remove trailing commas before } or ]
  return jsonString.replace(/,(\s*[}\]])/g, '$1');
}

function safeParseJson(text) {
  const sanitized = sanitizeAIOutput(text);
  const fixed = fixJson(sanitized);

  try {
    return JSON.parse(fixed);
  } catch (error1) {
    console.warn("Primary JSON parse failed, attempting jsonrepair:", error1.message);
    try {
      const repairedText = jsonrepair(fixed);
      return JSON.parse(repairedText);
    } catch (error2) {
      console.error("Repair JSON parse failed:", error2.message, "Original text:", fixed.slice(0, 500));
      throw new Error(`Invalid JSON from AI (${error2.message})`);
    }
  }
}

function makeFallbackQuiz(vocabulary) {
  if (!Array.isArray(vocabulary) || vocabulary.length === 0) return [];
  const allWords = vocabulary.map((item) => item.irish).filter(Boolean);
  const fallback = [];
  for (let i = 0; i < Math.min(5, vocabulary.length); i++) {
    const item = vocabulary[i];
    fallback.push({
      question: `What does \"${item.irish || allWords[i]}\" mean in English?`,
      options: [
        item.english || "(unknown)",
        vocabulary[(i + 1) % vocabulary.length]?.english || "(unknown)",
        vocabulary[(i + 2) % vocabulary.length]?.english || "(unknown)"
      ],
      answer: item.english || "(unknown)"
    });
  }
  return fallback;
}

function validateOutput(data) {
  if (!data || typeof data !== "object") return "Response must be an object";

  const keys = ["english_summary", "irish_summary", "vocabulary", "quiz"];
  for (const key of keys) {
    if (!(key in data)) return `Missing key: ${key}`;
  }

  const summaryKeys = ["quick", "smart", "deep"];
  for (const which of ["english_summary", "irish_summary"]) {
    if (typeof data[which] !== "object") return `${which} must be an object`;
    for (const sub of summaryKeys) {
      if (typeof data[which][sub] !== "string" || !data[which][sub].trim()) {
        return `${which}.${sub} must be a non-empty string`;
      }
    }
  }

  if (!Array.isArray(data.vocabulary) || data.vocabulary.length < 4) {
    return "vocabulary must be an array with at least 4 items";
  }

  if (!Array.isArray(data.quiz) || data.quiz.length < 3) {
    return "quiz must be an array with at least 3 questions";
  }

  return null;
}

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/analyze", async (req, res) => {
  try {
    const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
    if (isRateLimited(ip)) {
      return res.status(429).json({ error: "Too many requests. Try again later." });
    }

    const { title = "", headings = [], paragraphs = [] } = req.body || {};
    if (typeof title !== "string" || !Array.isArray(headings) || !Array.isArray(paragraphs)) {
      return res.status(400).json({ error: "Invalid input format" });
    }

    const content = [title, ...headings, ...paragraphs]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 12000);

    const prompt = `
You are generating structured webpage summaries and Irish learning content for a browser extension.

Analyze the webpage content and return STRICTLY valid JSON only.

Return this exact structure:
{
  "english_summary": { "quick": "string", "smart": "string", "deep": "string" },
  "irish_summary": { "quick": "string", "smart": "string", "deep": "string" },
  "vocabulary": [{ "irish": "string", "english": "string", "example": "string" }],
  "quiz": [{ "question": "string", "options": ["string","string","string"], "answer": "string" }]
}

Rules:
- english_summary.quick = about 60-100 words
- english_summary.smart = about 160-250 words
- english_summary.deep = about 300-500 words, dense but readable
- irish summaries must be simpler and learner-friendly
- irish deep should be noticeably fuller than irish smart
- vocabulary = 10-20 useful Irish words/phrases from content
- each vocabulary item must have irish, english, example
- quiz = 5 questions based ONLY on vocabulary
- quiz questions must test meaning of vocabulary terms; no unrelated topics
- no markdown, no code blocks, no non-JSON text, pure JSON only

Webpage content:
${content}
`;

    async function getParsedOutput() {
      const promptPayload = {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a precise summarization and Irish-language learning assistant. Output JSON only." },
          { role: "user", content: prompt }
        ],
        temperature: 0.4,
        max_tokens: 1200
      };

      let lastError = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await openai.chat.completions.create(promptPayload);
          const text = response?.choices?.[0]?.message?.content;

          if (!text || typeof text !== "string") {
            lastError = new Error("AI returned no text");
            console.warn(`Attempt ${attempt}: AI returned no text`, response);
            continue;
          }

          let parsed = safeParseJson(text);
          let validationError = validateOutput(parsed);

          if (validationError) {
            if (validationError === "Missing key: quiz") {
              parsed.quiz = makeFallbackQuiz(parsed.vocabulary);
              validationError = validateOutput(parsed);
            }
          }

          if (validationError) {
            lastError = new Error(`Validation failed: ${validationError}`);
            console.warn(`Attempt ${attempt}: AI output validation failed:`, validationError, "raw:", text);
            continue;
          }

          return parsed;
        } catch (err) {
          lastError = err;
          console.warn(`Attempt ${attempt}: parse/AI error`, err);
        }
      }

      throw lastError;
    }

    let parsed;
    try {
      parsed = await getParsedOutput();
    } catch (err) {
      console.error("Final AI parse failure:", err);
      return res.status(500).json({ error: "Invalid JSON from AI", details: err.message });
    }

    // Ensure vocabulary has enough entries and quiz is based on vocabulary
    parsed.vocabulary = Array.isArray(parsed.vocabulary) ? parsed.vocabulary.slice(0, 20) : [];
    if (parsed.vocabulary.length < 10) {
      console.warn("Vocabulary has fewer than 10 items, continuing with available items.");
    }

    if (!Array.isArray(parsed.quiz) || parsed.quiz.length < 5) {
      parsed.quiz = makeFallbackQuiz(parsed.vocabulary);
    } else {
      parsed.quiz = parsed.quiz.slice(0, 5);
    }

    res.json(parsed);
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

const PORT = Number(process.env.PORT || 3012);

const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Start with another port, e.g. PORT=3010 npm start`);
  } else {
    console.error("Server error:", err);
  }
  process.exit(1);
});