const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();
let nextNominatimRequestAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeCoordinates = (latitude, longitude) => {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    const error = new Error("Invalid location coordinates");
    error.statusCode = 400;
    throw error;
  }
  return { lat, lon };
};

const cacheKey = (lat, lon) => `${lat.toFixed(5)},${lon.toFixed(5)}`;

const getCached = (key) => {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.createdAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return item.value;
};

const setCached = (key, value) => {
  cache.set(key, { createdAt: Date.now(), value });
  if (cache.size > 1000) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
};

const requestJson = async (url, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number(process.env.GEOCODING_TIMEOUT_MS || 8000)
  );

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Nominatim returned HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
};

const componentsToAddress = (components = {}) => ({
  area:
    components.suburb ||
    components.neighbourhood ||
    components.city_district ||
    components.town ||
    components.village ||
    null,
  city:
    components.city ||
    components.town ||
    components.municipality ||
    components.village ||
    null,
  state: components.state || null,
  country: components.country || null,
  pincode: components.postcode || null,
});

const reverseNominatim = async (lat, lon) => {
  // Nominatim's public service asks clients to keep requests to about 1/sec.
  const now = Date.now();
  if (nextNominatimRequestAt > now) {
    await sleep(nextNominatimRequestAt - now);
  }
  nextNominatimRequestAt = Date.now() + 1100;

  const userAgent =
    process.env.GEOCODING_USER_AGENT ||
    "Sahayog/1.0 (OpenStreetMap Nominatim reverse geocoding)";

  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");

  const data = await requestJson(url, {
    headers: {
      "User-Agent": userAgent,
      "Accept-Language": process.env.GEOCODING_LANGUAGE || "en-IN,en;q=0.8",
    },
  });

  if (!data?.display_name) {
    throw new Error("No address was returned by OpenStreetMap Nominatim");
  }

  return {
    formatted: data.display_name,
    ...componentsToAddress(data.address),
  };
};

export const reverseGeocode = async (latitude, longitude) => {
  const { lat, lon } = normalizeCoordinates(latitude, longitude);
  const key = cacheKey(lat, lon);
  const cached = getCached(key);
  if (cached) return cached;

  const result = await reverseNominatim(lat, lon);

  const normalized = {
    formatted: String(result.formatted || "Location detected").slice(0, 500),
    area: result.area ? String(result.area).slice(0, 150) : null,
    city: result.city ? String(result.city).slice(0, 100) : null,
    state: result.state ? String(result.state).slice(0, 100) : null,
    country: result.country ? String(result.country).slice(0, 100) : null,
    pincode: result.pincode ? String(result.pincode).slice(0, 20) : null,
  };

  setCached(key, normalized);
  return normalized;
};
