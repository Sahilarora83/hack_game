/**
 * WinGo history analyzer and simple statistical predictor.
 *
 * This script only reads public API response data. It does not bypass security,
 * automate betting, or guarantee outcomes. Treat predictions as statistical
 * analysis only.
 *
 * Usage:
 *   npm install axios
 *   node wingo-analyzer.js
 *
 * Optional environment variables:
 *   WINGO_API_URL=https://example.com/WinGo/WinGo_30S/GetHistoryIssuePage.json
 *   WINGO_POLL_MS=30000
 *   WINGO_TARGET_RECORDS=500
 */

const fs = require("fs/promises");
const path = require("path");
const axios = require("axios");

const API_URL =
  process.env.WINGO_API_URL ||
  "https://api.jaiclubapi.com/WinGo/WinGo_30S/GetHistoryIssuePage.json";
const API_REFERER = process.env.WINGO_API_REFERER || "https://www.jaiclub48.com/";
const STORE_FILE = path.join(__dirname, "wingo-history.json");
const POLL_MS = Number(process.env.WINGO_POLL_MS || 30_000);
const TARGET_RECORDS = Number(process.env.WINGO_TARGET_RECORDS || 500);
const RECENT_WINDOW = 20;

function normalizeRecord(raw) {
  const number = Number(raw.number);

  if (!raw.issueNumber || !Number.isInteger(number) || number < 0 || number > 9) {
    return null;
  }

  return {
    issueNumber: String(raw.issueNumber),
    number,
    color: String(raw.color || "unknown"),
  };
}

function extractRecords(payload) {
  const possibleLists = [
    payload?.data?.list,
    payload?.list,
    payload?.data,
    payload,
  ];

  const list = possibleLists.find(Array.isArray);

  if (!list) {
    throw new Error("Could not find a record list in API response.");
  }

  return list.map(normalizeRecord).filter(Boolean);
}

async function fetchHistoryPage(pageNo = 1, pageSize = 10) {
  const response = await axios.get(API_URL, {
    timeout: 15_000,
    headers: {
      Accept: "application/json, text/plain, */*",
      Origin: new URL(API_REFERER).origin,
      Referer: API_REFERER,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
    },
    params: {
      pageNo,
      pageSize,
      // Some APIs use different parameter names; harmless if ignored.
      page: pageNo,
      limit: pageSize,
    },
  });

  return extractRecords(response.data);
}

async function fetchDataset(targetRecords = TARGET_RECORDS) {
  let records = [];

  for (let pageNo = 1; records.length < targetRecords; pageNo += 1) {
    const page = await fetchHistoryPage(pageNo, 50);
    if (page.length === 0) break;

    const before = records.length;
    records = mergeRecords(records, page).slice(0, targetRecords);
    if (records.length === before) break;
  }

  return records;
}

async function loadLocalHistory() {
  try {
    const file = await fs.readFile(STORE_FILE, "utf8");
    const records = JSON.parse(file);
    return Array.isArray(records) ? records.map(normalizeRecord).filter(Boolean) : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function saveLocalHistory(records) {
  await fs.writeFile(STORE_FILE, JSON.stringify(records, null, 2));
}

function mergeRecords(existing, incoming) {
  const byIssue = new Map();

  for (const record of [...existing, ...incoming]) {
    byIssue.set(record.issueNumber, record);
  }

  return [...byIssue.values()]
    .sort((a, b) => BigInt(b.issueNumber) > BigInt(a.issueNumber) ? 1 : -1)
    .slice(0, TARGET_RECORDS);
}

async function buildInitialDataset() {
  let records = await loadLocalHistory();

  for (let pageNo = 1; records.length < TARGET_RECORDS; pageNo += 1) {
    const page = await fetchHistoryPage(pageNo, 50);
    if (page.length === 0) break;

    const before = records.length;
    records = mergeRecords(records, page);
    if (records.length === before) break;
  }

  await saveLocalHistory(records);
  return records;
}

function sizeOf(number) {
  return number >= 5 ? "Big" : "Small";
}

function calculateFrequency(records) {
  const frequency = Object.fromEntries([...Array(10).keys()].map((n) => [n, 0]));

  for (const record of records) {
    frequency[record.number] += 1;
  }

  return frequency;
}

function calculateBigSmallRatio(records) {
  const counts = { Big: 0, Small: 0 };

  for (const record of records) {
    counts[sizeOf(record.number)] += 1;
  }

  const total = counts.Big + counts.Small || 1;
  return {
    counts,
    ratio: {
      Big: Number((counts.Big / total).toFixed(3)),
      Small: Number((counts.Small / total).toFixed(3)),
    },
  };
}

function detectStreaks(records) {
  if (records.length === 0) {
    return { numberStreak: null, sizeStreak: null };
  }

  const latest = records[0];
  let numberLength = 0;
  let sizeLength = 0;

  for (const record of records) {
    if (record.number === latest.number) numberLength += 1;
    else break;
  }

  for (const record of records) {
    if (sizeOf(record.number) === sizeOf(latest.number)) sizeLength += 1;
    else break;
  }

  return {
    numberStreak: { value: latest.number, length: numberLength },
    sizeStreak: { value: sizeOf(latest.number), length: sizeLength },
  };
}

function calculateTransitionProbabilities(records) {
  const counts = {
    "Big->Big": 0,
    "Big->Small": 0,
    "Small->Big": 0,
    "Small->Small": 0,
  };

  // Records are newest first, so iterate oldest to newest for real transitions.
  const chronological = [...records].reverse();

  for (let i = 1; i < chronological.length; i += 1) {
    const previous = sizeOf(chronological[i - 1].number);
    const current = sizeOf(chronological[i].number);
    counts[`${previous}->${current}`] += 1;
  }

  const bigTotal = counts["Big->Big"] + counts["Big->Small"] || 1;
  const smallTotal = counts["Small->Big"] + counts["Small->Small"] || 1;

  return {
    counts,
    probabilities: {
      "Big->Big": Number((counts["Big->Big"] / bigTotal).toFixed(3)),
      "Big->Small": Number((counts["Big->Small"] / bigTotal).toFixed(3)),
      "Small->Big": Number((counts["Small->Big"] / smallTotal).toFixed(3)),
      "Small->Small": Number((counts["Small->Small"] / smallTotal).toFixed(3)),
    },
  };
}

function analyze(records) {
  return {
    totalRecords: records.length,
    frequency: calculateFrequency(records),
    bigSmall: calculateBigSmallRatio(records),
    streaks: detectStreaks(records),
    transitions: calculateTransitionProbabilities(records),
  };
}

function predict(records) {
  const recent = records.slice(0, RECENT_WINDOW);
  const recent10 = records.slice(0, 10);
  const analysis = analyze(records);
  const recentFrequency = calculateFrequency(recent);
  const recentBigSmall = calculateBigSmallRatio(recent);
  const latestSize = records[0] ? sizeOf(records[0].number) : "Small";
  const transition = analysis.transitions.probabilities;
  const streak = analysis.streaks.sizeStreak;

  let bigScore = recentBigSmall.ratio.Big;
  let smallScore = recentBigSmall.ratio.Small;

  if (latestSize === "Big") {
    bigScore += transition["Big->Big"];
    smallScore += transition["Big->Small"];
  } else {
    bigScore += transition["Small->Big"];
    smallScore += transition["Small->Small"];
  }

  // Long same-size streaks often invite a conservative mean-reversion signal.
  if (streak?.length >= 3) {
    if (streak.value === "Big") smallScore += 0.35;
    if (streak.value === "Small") bigScore += 0.35;
  }

  const predictedRange = bigScore >= smallScore ? "Big" : "Small";
  const rangeNumbers = predictedRange === "Big" ? [5, 6, 7, 8, 9] : [0, 1, 2, 3, 4];

  const topNumbers = rangeNumbers
    .map((number) => ({
      number,
      score:
        (recentFrequency[number] || 0) * 2 +
        (analysis.frequency[number] || 0) / Math.max(records.length, 1) +
        (recent10.some((record) => record.number === number) ? 0.25 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((item) => item.number);

  return {
    predictedRange,
    rangeLabel: predictedRange === "Big" ? "5-9" : "0-4",
    topNumbers,
    scores: {
      Big: Number(bigScore.toFixed(3)),
      Small: Number(smallScore.toFixed(3)),
    },
  };
}

function printReport(records) {
  const analysis = analyze(records);
  const prediction = predict(records);

  console.log(`Records stored: ${analysis.totalRecords}`);
  console.log("Number frequency:", analysis.frequency);
  console.log(
    `Big/Small ratio: Big ${analysis.bigSmall.ratio.Big}, Small ${analysis.bigSmall.ratio.Small}`
  );
  console.log(
    `Current streaks: number ${analysis.streaks.numberStreak?.value} x${analysis.streaks.numberStreak?.length}, ` +
      `${analysis.streaks.sizeStreak?.value} x${analysis.streaks.sizeStreak?.length}`
  );
  console.log("Transition probabilities:", analysis.transitions.probabilities);
  console.log(
    `Next Prediction: ${prediction.predictedRange} (${prediction.rangeLabel}), ` +
      `likely numbers: ${prediction.topNumbers.join(", ")}`
  );
  console.log("Reminder: statistical analysis only; not a guaranteed prediction.\n");
}

async function pollOnce(records) {
  const latestRecords = await fetchHistoryPage(1, 50);
  const merged = mergeRecords(records, latestRecords);

  if (merged.length !== records.length || merged[0]?.issueNumber !== records[0]?.issueNumber) {
    await saveLocalHistory(merged);
    console.log(`[${new Date().toLocaleString()}] Dataset updated.`);
  } else {
    console.log(`[${new Date().toLocaleString()}] No new issue found.`);
  }

  printReport(merged);
  return merged;
}

async function startLiveMode() {
  let records = await buildInitialDataset();

  if (records.length === 0) {
    throw new Error("No valid records were loaded. Check WINGO_API_URL and API response format.");
  }

  printReport(records);

  setInterval(async () => {
    try {
      records = await pollOnce(records);
    } catch (error) {
      console.error(`[${new Date().toLocaleString()}] Poll failed: ${error.message}`);
    }
  }, POLL_MS);
}

if (require.main === module) {
  startLiveMode().catch((error) => {
    console.error(`Startup failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  analyze,
  buildInitialDataset,
  calculateBigSmallRatio,
  calculateFrequency,
  calculateTransitionProbabilities,
  detectStreaks,
  extractRecords,
  fetchDataset,
  fetchHistoryPage,
  mergeRecords,
  normalizeRecord,
  predict,
  printReport,
  sizeOf,
};
