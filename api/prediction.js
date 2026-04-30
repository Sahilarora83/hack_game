const fs = require("fs/promises");
const path = require("path");
const {
  APP_VERSION,
  analyze,
  extractRecords,
  fetchDataset,
  predict,
} = require("../wingo-analyzer");

async function loadBundledSample() {
  const samplePath = path.join(process.cwd(), "GetHistoryIssuePage.json");
  const sample = JSON.parse(await fs.readFile(samplePath, "utf8"));
  return extractRecords(sample);
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const targetRecords = Number(req.query.records || process.env.WINGO_TARGET_RECORDS || 500);
    let records;
    let warning = null;

    try {
      records = await fetchDataset(targetRecords);
    } catch (error) {
      warning =
        `Live upstream API failed: ${error.message}. Showing bundled sample data instead. ` +
        "Set WINGO_API_URL in Vercel to a working public history JSON endpoint for live mode.";
      records = await loadBundledSample();
    }

    if (records.length === 0) {
      return res.status(502).json({
        error: "No valid records returned by upstream API.",
      });
    }

    return res.status(200).json({
      appVersion: APP_VERSION,
      updatedAt: new Date().toISOString(),
      latestIssue: records[0]?.issueNumber,
      source: warning ? "sample" : "live",
      warning,
      analysis: analyze(records),
      prediction: predict(records),
      disclaimer:
        "Statistical analysis only. This is not a guaranteed prediction and does not bypass any security.",
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
};
