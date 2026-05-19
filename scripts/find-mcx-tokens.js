const fs = require("fs");

const filePath = "scripmaster.json";

if (!fs.existsSync(filePath)) {
  console.error("scripmaster.json not found. Download it first.");
  process.exit(1);
}

const raw = fs.readFileSync(filePath, "utf8");
const data = JSON.parse(raw);

const wanted = ["CRUDEOIL", "GOLD", "SILVER", "COPPER"];

const monthMap = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

function parseExpiry(expiry) {
  if (!expiry || typeof expiry !== "string") return null;

  const clean = expiry.trim().toUpperCase();

  // Example: 20MAY2026
  const match = clean.match(/^(\d{1,2})([A-Z]{3})(\d{4})$/);

  if (!match) return null;

  const day = Number(match[1]);
  const month = monthMap[match[2]];
  const year = Number(match[3]);

  if (month === undefined) return null;

  return new Date(year, month, day);
}

function isFutureOrToday(date) {
  if (!date) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return date >= today;
}

function displayName(name) {
  if (name === "CRUDEOIL") return "Crude Oil";
  if (name === "GOLD") return "Gold";
  if (name === "SILVER") return "Silver";
  if (name === "COPPER") return "Copper";
  return name;
}

for (const name of wanted) {
  const matches = data
    .filter((item) => {
      const itemName = String(item.name || "").toUpperCase();
      const symbol = String(item.symbol || "").toUpperCase();
      const exch = String(item.exch_seg || "").toUpperCase();
      const instrumentType = String(item.instrumenttype || "").toUpperCase();

      return (
        exch === "MCX" &&
        instrumentType === "FUTCOM" &&
        itemName === name &&
        symbol.includes("FUT")
      );
    })
    .map((item) => {
      const expiryDate = parseExpiry(item.expiry);

      return {
        token: item.token,
        symbol: item.symbol,
        name: item.name,
        expiry: item.expiry,
        expiryDate,
        exch_seg: item.exch_seg,
        instrumenttype: item.instrumenttype,
        lotsize: item.lotsize,
      };
    })
    .filter((item) => isFutureOrToday(item.expiryDate))
    .sort((a, b) => a.expiryDate - b.expiryDate);

  console.log("\n========================================");
  console.log(name);
  console.log("========================================");

  if (!matches.length) {
    console.log("No active future contracts found.");
    continue;
  }

  const nearest = matches[0];

  console.log("Nearest active contract:");
  console.log({
    token: nearest.token,
    symbol: nearest.symbol,
    expiry: nearest.expiry,
    lotsize: nearest.lotsize,
  });

  console.log("\nTypeScript snippet:");
  console.log(`${name}: {
  symbol: "${name}",
  tradingSymbol: "${nearest.symbol}",
  exchange: "MCX",
  token: "${nearest.token}",
  name: "${displayName(name)}",
  category: "NATURAL_RESOURCES",
},`);
}