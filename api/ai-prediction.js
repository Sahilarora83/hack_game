const Groq = require("groq-sdk");

const MODEL = "llama-3.1-8b-instant";

function sanitizeRecords(records) {
  if (!Array.isArray(records)) return [];

  return records
    .map((record) => {
      const number = Number(record.number);
      if (!record.issueNumber || !Number.isInteger(number) || number < 0 || number > 9) {
        return null;
      }

      return {
        issueNumber: String(record.issueNumber),
        number,
        size: number >= 5 ? "Big" : "Small",
        color: String(record.color || "unknown"),
      };
    })
    .filter(Boolean)
    .slice(0, 120);
}

function fallbackPrediction(records) {
  const recent = records.slice(0, 10);
  const small = recent.filter((record) => record.number <= 4).length;
  const big = recent.length - small;
  const predictedRange = small >= big ? "Small" : "Big";
  const candidates = predictedRange === "Small" ? [0, 1, 2, 3, 4] : [5, 6, 7, 8, 9];
  const frequency = Object.fromEntries(candidates.map((number) => [number, 0]));

  recent.forEach((record) => {
    if (frequency[record.number] !== undefined) frequency[record.number] += 1;
  });

  return {
    predictedRange,
    rangeLabel: predictedRange === "Small" ? "0-4" : "5-9",
    topNumbers: candidates.sort((a, b) => frequency[b] - frequency[a]).slice(0, 2),
    confidence: "Low",
    reason: "Groq AI is unavailable, so this is the local fallback based on recent frequency.",
  };
}

function buildSummary(records) {
  const recent10 = records.slice(0, 10);
  const recent20 = records.slice(0, 20);
  const frequency = Object.fromEntries([...Array(10).keys()].map((number) => [number, 0]));
  const sizeCounts = { Big: 0, Small: 0 };

  recent20.forEach((record) => {
    frequency[record.number] += 1;
    sizeCounts[record.size] += 1;
  });

  let sizeStreak = 0;
  const latestSize = records[0]?.size;
  for (const record of records) {
    if (record.size === latestSize) sizeStreak += 1;
    else break;
  }

  return {
    latestIssue: records[0]?.issueNumber,
    latestNumber: records[0]?.number,
    latestSize,
    recent10: recent10.map((record) => `${record.number}-${record.size[0]}`),
    recent20Frequency: frequency,
    recent20SizeCounts: sizeCounts,
    currentSizeStreak: latestSize ? `${latestSize} x${sizeStreak}` : "none",
    totalRecordsProvided: records.length,
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const records = sanitizeRecords(req.body?.records);

  if (records.length < 5) {
    return res.status(400).json({ error: "At least 5 valid records are required." });
  }

  if (!process.env.GROQ_API_KEY) {
    return res.status(200).json({
      source: "local-fallback",
      prediction: fallbackPrediction(records),
      warning: "GROQ_API_KEY is not configured in Vercel.",
    });
  }

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const summary = buildSummary(records);
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You analyze WinGo public history data for statistical pattern exploration only. " +
            "Predict only the immediate next issue after the latest issue. " +
            "Do not claim certainty, do not encourage betting, and return strict JSON only. " +
            "Never copy the already known latest result as the prediction.",
        },
        {
          role: "user",
          content:
            "Given these newest-first records, produce one JSON object with keys: " +
            "predictedRange ('Small' or 'Big'), rangeLabel ('0-4' or '5-9'), " +
            "topNumbers (array of exactly two integers), confidence ('Low', 'Medium', or 'High'), " +
            "reason (short Hinglish explanation). topNumbers must belong inside the predictedRange. " +
            "Use recent 10-20 results, frequency, missing numbers, current streak, and Big/Small transitions. " +
            "If signals conflict, choose Low confidence and explain the conflict. " +
            "Return JSON only.\n\nSummary:\n" +
            JSON.stringify(summary) +
            "\n\nRecords:\n" +
            JSON.stringify(records),
        },
      ],
      temperature: 0.2,
      max_completion_tokens: 700,
      top_p: 1,
      response_format: { type: "json_object" },
    });

    const content = completion.choices?.[0]?.message?.content || "{}";
    const prediction = JSON.parse(content);
    const normalizedRange = prediction.predictedRange === "Big" ? "Big" : "Small";
    const allowedNumbers = normalizedRange === "Big" ? [5, 6, 7, 8, 9] : [0, 1, 2, 3, 4];
    const topNumbers = Array.isArray(prediction.topNumbers)
      ? prediction.topNumbers.map(Number).filter((number) => allowedNumbers.includes(number))
      : [];

    return res.status(200).json({
      source: "groq",
      model: MODEL,
      prediction: {
        predictedRange: normalizedRange,
        rangeLabel: normalizedRange === "Big" ? "5-9" : "0-4",
        topNumbers: [...topNumbers, ...allowedNumbers].slice(0, 2),
        confidence: ["Low", "Medium", "High"].includes(prediction.confidence)
          ? prediction.confidence
          : "Low",
        reason: prediction.reason || "Groq analyzed recent public history signals.",
      },
    });
  } catch (error) {
    return res.status(200).json({
      source: "local-fallback",
      prediction: fallbackPrediction(records),
      warning: `Groq request failed: ${error.message}`,
    });
  }
};
