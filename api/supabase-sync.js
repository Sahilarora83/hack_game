const SUPABASE_URL = (process.env.SUPABASE_URL || "")
  .replace(/\/rest\/v1\/?$/, "")
  .replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supabaseRequest(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase server env vars are not configured.");
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase ${path} failed: ${response.status} ${body}`);
  }

  return response;
}

function sizeOf(number) {
  return Number(number) >= 5 ? "Big" : "Small";
}

function normalizeResult(record) {
  const number = Number(record.number);
  if (!record.issueNumber || !Number.isInteger(number) || number < 0 || number > 9) {
    return null;
  }

  return {
    issue_number: String(record.issueNumber),
    game_code: "WinGo_30S",
    number,
    color: String(record.color || "unknown"),
    source: "public_api",
    raw: record,
  };
}

function normalizePrediction(prediction) {
  const predictedNumber = Number(prediction.predictedNumber);
  if (
    !prediction.issueNumber ||
    !prediction.predictedRange ||
    !Number.isInteger(predictedNumber) ||
    predictedNumber < 0 ||
    predictedNumber > 9
  ) {
    return null;
  }

  return {
    issue_number: String(prediction.issueNumber),
    previous_issue_number: prediction.previousIssueNumber
      ? String(prediction.previousIssueNumber)
      : null,
    game_code: "WinGo_30S",
    predicted_number: predictedNumber,
    predicted_range: prediction.predictedRange === "Big" ? "Big" : "Small",
    top_numbers: Array.isArray(prediction.topNumbers)
      ? prediction.topNumbers.map(Number).filter((number) => Number.isInteger(number))
      : [predictedNumber],
    confidence: ["Low", "Medium", "High"].includes(prediction.confidence)
      ? prediction.confidence
      : "Low",
    action: ["SKIP", "WATCH", "STRONG", "TRACK"].includes(prediction.action)
      ? prediction.action
      : "WATCH",
    source: ["local", "groq", "local-fallback"].includes(prediction.source)
      ? prediction.source
      : "local",
    reason: prediction.reason || null,
    model: prediction.model || null,
    input_summary: prediction.inputSummary || null,
    raw_response: prediction.rawResponse || prediction,
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const results = Array.isArray(req.body?.results)
      ? req.body.results.map(normalizeResult).filter(Boolean).slice(0, 120)
      : [];
    const predictions = Array.isArray(req.body?.predictions)
      ? req.body.predictions.map(normalizePrediction).filter(Boolean).slice(0, 50)
      : [];

    if (results.length) {
      await supabaseRequest("wingo_results?on_conflict=issue_number", {
        method: "POST",
        body: JSON.stringify(results),
      });
    }

    if (predictions.length) {
      await supabaseRequest("wingo_predictions?on_conflict=issue_number,source", {
        method: "POST",
        body: JSON.stringify(predictions),
      });
    }

    return res.status(200).json({
      ok: true,
      syncedResults: results.length,
      syncedPredictions: predictions.length,
    });
  } catch (error) {
    return res.status(200).json({
      ok: false,
      disabled: error.message.includes("env vars"),
      error: error.message,
    });
  }
};
