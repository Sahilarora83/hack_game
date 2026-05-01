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
    .slice(0, 500);
}

function sanitizePredictionHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .map((entry) => ({
      issueNumber: String(entry.issueNumber || ""),
      predictedNumber: Number(entry.predictedNumber),
      predictedRange: entry.predictedRange === "Big" ? "Big" : "Small",
      actualNumber: entry.actualNumber === undefined ? null : Number(entry.actualNumber),
      actualRange: entry.actualRange || null,
      rangeCorrect: Boolean(entry.rangeCorrect),
      numberCorrect: Boolean(entry.numberCorrect),
      action: entry.action || "TRACK",
      source: entry.source || "local",
      status: entry.status || "pending",
    }))
    .filter((entry) => entry.issueNumber && Number.isInteger(entry.predictedNumber))
    .slice(0, 40);
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
    predictedNumber: candidates.sort((a, b) => frequency[b] - frequency[a])[0],
    topNumbers: candidates.sort((a, b) => frequency[b] - frequency[a]).slice(0, 2),
    confidence: "Low",
    reason: "Groq AI is unavailable, so this is the local fallback based on recent frequency.",
  };
}

function buildSummary(records) {
  const recent10 = records.slice(0, 10);
  const recent20 = records.slice(0, 20);
  const recent40 = records.slice(0, 40);
  const blocks = [50, 100, 200, 500].map((windowSize) => {
    const slice = records.slice(0, Math.min(windowSize, records.length));
    const frequency = Object.fromEntries([...Array(10).keys()].map((number) => [number, 0]));
    const sizeCounts = { Big: 0, Small: 0 };
    slice.forEach((record) => {
      frequency[record.number] += 1;
      sizeCounts[record.size] += 1;
    });
    return { window: slice.length, frequency, sizeCounts };
  });
  const allFrequency = Object.fromEntries([...Array(10).keys()].map((number) => [number, 0]));
  const frequency = Object.fromEntries([...Array(10).keys()].map((number) => [number, 0]));
  const sizeCounts = { Big: 0, Small: 0 };
  const allSizeCounts = { Big: 0, Small: 0 };

  records.forEach((record) => {
    allFrequency[record.number] += 1;
    allSizeCounts[record.size] += 1;
  });

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
    recent40Sequence: recent40.map((record) => record.number).join(""),
    recent20Frequency: frequency,
    recent20SizeCounts: sizeCounts,
    allFrequency,
    allSizeCounts,
    blockSummaries: blocks,
    currentSizeStreak: latestSize ? `${latestSize} x${sizeStreak}` : "none",
    totalRecordsProvided: records.length,
  };
}

function compactHistory(history) {
  return history
    .slice(0, 12)
    .map((entry) => ({
      i: entry.issueNumber.slice(-4),
      p: `${entry.predictedNumber}${entry.predictedRange[0]}`,
      a: Number.isInteger(entry.actualNumber) ? `${entry.actualNumber}${String(entry.actualRange || "")[0]}` : "-",
      ok: entry.status === "graded" ? `${entry.rangeCorrect ? "R1" : "R0"}${entry.numberCorrect ? "N1" : "N0"}` : "pending",
      act: entry.action || "TRACK",
    }));
}

function buildAccuracyFeedback(history) {
  const graded = history.filter((entry) => entry.status === "graded");
  const recent = graded.slice(0, 40);
  const byRange = { Big: { ok: 0, total: 0 }, Small: { ok: 0, total: 0 } };
  const exactMisses = {};

  for (const entry of recent) {
    byRange[entry.predictedRange].total += 1;
    if (entry.rangeCorrect) byRange[entry.predictedRange].ok += 1;

    const key = `${entry.predictedNumber}->${entry.actualNumber}`;
    exactMisses[key] = (exactMisses[key] || 0) + 1;
  }

  return {
    checked: graded.length,
    recentChecked: recent.length,
    recentRangeAccuracy: recent.length
      ? Number((recent.filter((entry) => entry.rangeCorrect).length / recent.length).toFixed(3))
      : null,
    recentExactAccuracy: recent.length
      ? Number((recent.filter((entry) => entry.numberCorrect).length / recent.length).toFixed(3))
      : null,
    byPredictedRange: byRange,
    commonExactMisses: Object.entries(exactMisses)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8),
  };
}

function retryAfterMsFromError(error) {
  const status = error?.status || error?.response?.status;
  const retryHeader = error?.headers?.["retry-after"] || error?.response?.headers?.["retry-after"];
  const retrySeconds = Number(retryHeader);
  if (Number.isFinite(retrySeconds) && retrySeconds > 0) {
    return Math.ceil(retrySeconds * 1000);
  }

  const message = String(error?.message || "");
  const match = message.match(/try again in\s+([\d.]+)s/i);
  if (match) return Math.ceil(Number(match[1]) * 1000);
  return status === 429 ? 60_000 : null;
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
  const predictionHistory = sanitizePredictionHistory(req.body?.predictionHistory);

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
    const accuracyFeedback = buildAccuracyFeedback(predictionHistory);
    const compactPredictionHistory = compactHistory(predictionHistory);
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You analyze WinGo public history data for statistical pattern exploration only. " +
            "Predict only the immediate next issue after the latest issue. " +
            "Use both older records and newest records. Use prior prediction history as feedback and avoid repeating patterns that were recently wrong. " +
            "Do not claim certainty, do not encourage betting, and return strict JSON only. " +
            "Never copy the already known latest result as the prediction.",
        },
        {
          role: "user",
          content:
            "Given these newest-first records, produce one JSON object with keys: " +
            "predictedRange ('Small' or 'Big'), rangeLabel ('0-4' or '5-9'), " +
            "predictedNumber (one integer 0-9), topNumbers (array of exactly two integers), " +
            "confidence ('Low', 'Medium', or 'High'), reason (short Hinglish explanation). " +
            "predictedNumber and topNumbers must belong inside the predictedRange. " +
            "Use recent 10-20 results, frequency, missing numbers, current streak, and Big/Small transitions. " +
            "Also compare 50/100/200/500 record block summaries and prior wrong predictions in AccuracyFeedback. " +
            "If one side has been over-predicted and recently wrong, reduce its weight. " +
            "If signals conflict, choose Low confidence and explain the conflict. " +
            "Return JSON only.\n\nSummary:\n" +
            JSON.stringify(summary) +
            "\n\nAccuracyFeedback:\n" +
            JSON.stringify(accuracyFeedback) +
            "\n\nRecentPredictionHistoryCompact:\n" +
            JSON.stringify(compactPredictionHistory),
        },
      ],
      temperature: 0.2,
      max_completion_tokens: 220,
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
    const predictedNumber = allowedNumbers.includes(Number(prediction.predictedNumber))
      ? Number(prediction.predictedNumber)
      : topNumbers[0] || allowedNumbers[0];

    return res.status(200).json({
      source: "groq",
      model: MODEL,
      prediction: {
        predictedRange: normalizedRange,
        rangeLabel: normalizedRange === "Big" ? "5-9" : "0-4",
        predictedNumber,
        topNumbers: [predictedNumber, ...topNumbers, ...allowedNumbers]
          .filter((number, index, list) => list.indexOf(number) === index)
          .slice(0, 2),
        confidence: ["Low", "Medium", "High"].includes(prediction.confidence)
          ? prediction.confidence
          : "Low",
        reason: prediction.reason || "Groq analyzed recent public history signals.",
      },
    });
  } catch (error) {
    const retryAfterMs = retryAfterMsFromError(error);
    return res.status(200).json({
      source: "local-fallback",
      prediction: fallbackPrediction(records),
      warning: retryAfterMs
        ? `Groq rate limit hit. AI will retry after ${Math.ceil(retryAfterMs / 1000)} seconds.`
        : `Groq request failed: ${error.message}`,
      retryAfterMs,
    });
  }
};
