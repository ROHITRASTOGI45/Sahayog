const SERVICE_KEYWORDS = {
  Plumbing: ["plumb", "plumber", "pipe", "leak", "leaking", "tap", "faucet", "water", "sink", "drain", "toilet", "bathroom", "wash basin"],
  Electrical: ["electric", "electricity", "electrician", "fan", "light", "switch", "wire", "wiring", "socket", "plug", "power", "mcb", "fuse"],
  Carpentry: ["carpenter", "carpentry", "wood", "wooden", "door", "table", "chair", "furniture", "cabinet", "drawer", "shelf", "bed"],
  Painting: ["paint", "painting", "painter", "wall", "colour", "color", "putty", "texture", "distemper"],
  Cleaning: ["clean", "cleaning", "cleaner", "dust", "floor", "washroom", "bathroom", "mop", "sanitize", "deep clean"],
};

const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
const matchesKeyword = (text, keyword) => {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`, "i").test(text);
};

export const detectService = async (description) => {
  const text = normalize(description);
  if (!text) return { service: null, confidence: 0, scores: {} };
  const scores = Object.fromEntries(Object.entries(SERVICE_KEYWORDS).map(([service, keywords]) => [service, keywords.reduce((s, k) => s + (matchesKeyword(text, k) ? 1 : 0), 0)]));
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [bestService, bestScore] = ranked[0] || [null, 0];
  const secondScore = ranked[1]?.[1] || 0;
  if (!bestService || bestScore === 0) return { service: null, confidence: 0, scores };
  if (bestScore === secondScore) return { service: null, confidence: 0, scores, ambiguous: true };
  return { service: bestService, confidence: Number(Math.min(bestScore / 3, 1).toFixed(2)), scores };
};
