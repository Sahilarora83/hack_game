const { analyze, fetchDataset, predict } = require("../wingo-analyzer");

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
    const records = await fetchDataset(targetRecords);

    if (records.length === 0) {
      return res.status(502).json({
        error: "No valid records returned by upstream API.",
      });
    }

    return res.status(200).json({
      updatedAt: new Date().toISOString(),
      latestIssue: records[0]?.issueNumber,
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
