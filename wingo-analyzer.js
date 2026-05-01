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
 *   WINGO_STRATEGY=statistical|apk-random
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
const STRATEGY = (process.env.WINGO_STRATEGY || "statistical").toLowerCase();
const APP_VERSION = "2026-04-30-live-browser-fallback";

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

function getApkStylePeriod(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const totalMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();

  return `${year}${month}${day}1000${10001 + totalMinutes}`;
}

function apkRandomPrediction(date = new Date()) {
  const number = Math.floor(Math.random() * 10);
  const predictedRange = sizeOf(number);

  return {
    strategy: "apk-random",
    period: getApkStylePeriod(date),
    predictedRange,
    rangeLabel: predictedRange === "Big" ? "5-9" : "0-4",
    topNumbers: [number],
    scores: {
      Big: predictedRange === "Big" ? 1 : 0,
      Small: predictedRange === "Small" ? 1 : 0,
    },
    note: "Matches the decompiled APK behavior: random 0-9, then Big for 5-9 and Small for 0-4.",
  };
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

function majoritySize(records, limit = 10) {
  const counts = { Big: 0, Small: 0 };
  records.slice(0, limit).forEach((record) => {
    counts[sizeOf(record.number)] += 1;
  });
  return counts.Big >= counts.Small ? "Big" : "Small";
}

function boostedFeatures(records) {
  const latest = records[0]?.number ?? 0;
  const latestSize = sizeOf(latest) === "Big" ? 1 : 0;
  const streak = detectStreaks(records).sizeStreak || { value: "Small", length: 0 };
  const ratio5 = calculateBigSmallRatio(records.slice(0, 5)).ratio.Big;
  const ratio10 = calculateBigSmallRatio(records.slice(0, 10)).ratio.Big;
  const ratio20 = calculateBigSmallRatio(records.slice(0, 20)).ratio.Big;
  const transitions = calculateTransitionProbabilities(records).probabilities;
  const latestTransition = latestSize
    ? transitions["Big->Big"] - transitions["Big->Small"]
    : transitions["Small->Big"] - transitions["Small->Small"];
  const recentNumbers = records.slice(0, 10).map((record) => record.number);
  const average10 =
    recentNumbers.reduce((sum, number) => sum + number, 0) / Math.max(recentNumbers.length, 1);

  return [
    latest / 9,
    latestSize,
    Math.min(streak.length, 8) / 8,
    streak.value === "Big" ? 1 : 0,
    ratio5,
    ratio10,
    ratio20,
    latestTransition,
    average10 / 9,
  ];
}

function buildBoostedTrainingSet(records, maxRows = 220) {
  const rows = [];
  for (let i = 1; i <= Math.min(records.length - 25, maxRows); i += 1) {
    const past = records.slice(i);
    if (past.length < 25) continue;
    rows.push({
      x: boostedFeatures(past),
      y: sizeOf(records[i - 1].number) === "Big" ? 1 : -1,
    });
  }
  return rows.reverse();
}

function trainBoostedModel(rows, rounds = 24, learningRate = 0.18) {
  if (rows.length < 50) return null;
  const validationSize = Math.max(12, Math.floor(rows.length * 0.22));
  const validationRows = rows.slice(-validationSize);
  const trainingRows = rows.slice(0, -validationSize);
  if (trainingRows.length < 35) return null;

  const predictions = new Array(trainingRows.length).fill(0);
  const trees = [];
  const featureCount = trainingRows[0].x.length;
  let bestTrees = [];
  let bestValidationAccuracy = 0;
  let staleRounds = 0;

  for (let round = 0; round < rounds; round += 1) {
    const residuals = trainingRows.map((row, index) => row.y - predictions[index]);
    let best = null;

    for (let feature = 0; feature < featureCount; feature += 1) {
      const values = [...new Set(trainingRows.map((row) => Number(row.x[feature].toFixed(3))))].sort(
        (a, b) => a - b
      );
      const thresholds =
        values.length > 12
          ? values.filter((_, index) => index % Math.ceil(values.length / 12) === 0)
          : values;

      for (const threshold of thresholds) {
        for (const polarity of [1, -1]) {
          let leftSum = 0;
          let leftCount = 0;
          let rightSum = 0;
          let rightCount = 0;

          trainingRows.forEach((row, index) => {
            const goesLeft = polarity * row.x[feature] <= polarity * threshold;
            if (goesLeft) {
              leftSum += residuals[index];
              leftCount += 1;
            } else {
              rightSum += residuals[index];
              rightCount += 1;
            }
          });

          const minLeaf = Math.max(6, Math.floor(trainingRows.length * 0.06));
          if (leftCount < minLeaf || rightCount < minLeaf) continue;
          const leftValue = leftSum / leftCount;
          const rightValue = rightSum / rightCount;
          let loss = 0;
          trainingRows.forEach((row, index) => {
            const goesLeft = polarity * row.x[feature] <= polarity * threshold;
            const value = goesLeft ? leftValue : rightValue;
            loss += (residuals[index] - value) ** 2;
          });

          if (!best || loss < best.loss) {
            best = { feature, threshold, polarity, leftValue, rightValue, loss };
          }
        }
      }
    }

    if (!best) break;
    trees.push(best);
    trainingRows.forEach((row, index) => {
      const goesLeft = best.polarity * row.x[best.feature] <= best.polarity * best.threshold;
      predictions[index] += learningRate * (goesLeft ? best.leftValue : best.rightValue);
    });

    const validationAccuracy =
      validationRows.filter((row) => (boostedScore({ trees, learningRate }, row.x) >= 0 ? 1 : -1) === row.y)
        .length / validationRows.length;

    if (validationAccuracy > bestValidationAccuracy + 0.001) {
      bestValidationAccuracy = validationAccuracy;
      bestTrees = trees.slice();
      staleRounds = 0;
    } else {
      staleRounds += 1;
      if (staleRounds >= 5) break;
    }
  }

  const finalTrees = bestTrees.length ? bestTrees : trees.slice(0, 8);
  return {
    trees: finalTrees,
    learningRate,
    trainingRows: trainingRows.length,
    validationRows: validationRows.length,
    validationAccuracy: bestValidationAccuracy,
  };
}

function boostedScore(model, features) {
  if (!model?.trees?.length) return 0;
  return model.trees.reduce((score, tree) => {
    const goesLeft = tree.polarity * features[tree.feature] <= tree.polarity * tree.threshold;
    return score + model.learningRate * (goesLeft ? tree.leftValue : tree.rightValue);
  }, 0);
}

function xgboostPrediction(records) {
  const rows = buildBoostedTrainingSet(records);
  const model = trainBoostedModel(rows);
  if (!model) {
    const predictedRange = majoritySize(records, 10);
    return {
      predictedRange,
      score: predictedRange === "Big" ? 0.1 : -0.1,
      trainedRows: rows.length,
      trees: 0,
    };
  }

  const score = boostedScore(model, boostedFeatures(records));
  return {
    predictedRange: score >= 0 ? "Big" : "Small",
    score,
    trainedRows: rows.length,
    trees: model.trees.length,
    validationAccuracy: model.validationAccuracy,
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
  if (STRATEGY === "apk-random") {
    return apkRandomPrediction();
  }

  const recent = records.slice(0, RECENT_WINDOW);
  const recent10 = records.slice(0, 10);
  const analysis = analyze(records);
  const recentFrequency = calculateFrequency(recent);
  const recentBigSmall = calculateBigSmallRatio(recent);
  const latestSize = records[0] ? sizeOf(records[0].number) : "Small";
  const transition = analysis.transitions.probabilities;
  const streak = analysis.streaks.sizeStreak;
  const boosted = xgboostPrediction(records);

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

  const validationEdge = Math.max(0, (boosted.validationAccuracy || 0.5) - 0.5);
  const boostedWeight = Math.min(0.85, Math.max(0.15, Math.abs(boosted.score))) *
    Math.min(1, boosted.trainedRows / 100) *
    Math.min(1, validationEdge * 6);
  if (boosted.predictedRange === "Big") bigScore += boostedWeight;
  else smallScore += boostedWeight;

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
    strategy: "statistical+xgboost_boosted",
    predictedRange,
    rangeLabel: predictedRange === "Big" ? "5-9" : "0-4",
    topNumbers,
    scores: {
      Big: Number(bigScore.toFixed(3)),
      Small: Number(smallScore.toFixed(3)),
      xgboost: {
        predictedRange: boosted.predictedRange,
        score: Number(boosted.score.toFixed(3)),
        trainedRows: boosted.trainedRows,
        trees: boosted.trees,
        validationAccuracy: Number((boosted.validationAccuracy || 0).toFixed(3)),
      },
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
  if (prediction.period) {
    console.log(`APK-style period: ${prediction.period}`);
  }
  console.log(`Strategy mode: ${prediction.strategy}`);
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
  APP_VERSION,
  analyze,
  apkRandomPrediction,
  buildInitialDataset,
  calculateBigSmallRatio,
  calculateFrequency,
  calculateTransitionProbabilities,
  detectStreaks,
  extractRecords,
  fetchDataset,
  fetchHistoryPage,
  getApkStylePeriod,
  xgboostPrediction,
  mergeRecords,
  normalizeRecord,
  predict,
  printReport,
  sizeOf,
};
