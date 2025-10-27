import { useEffect } from "react";

const MIN_INTERVAL_MS = 10_000;
const DEFAULT_INTERVAL_MS = 5 * 60_000;

const parseEndpoints = (raw) => {
  if (typeof raw !== "string") {
    return [];
  }

  return raw
    .split(/[\s,;]+/)
    .map((value) => value.trim())
    .filter((value) => {
      if (!value) {
        return false;
      }
      try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
      } catch {
        console.warn(`[keepalive] Skipping invalid URL: ${value}`);
        return false;
      }
    });
};

const getIntervalMs = () => {
  const raw = import.meta.env.VITE_PING_INTERVAL_SECONDS;
  if (typeof raw !== "string") {
    return DEFAULT_INTERVAL_MS;
  }

  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(
      `[keepalive] Invalid VITE_PING_INTERVAL_SECONDS value "${raw}". Falling back to ${
        DEFAULT_INTERVAL_MS / 1000
      } seconds.`
    );
    return DEFAULT_INTERVAL_MS;
  }

  return Math.max(MIN_INTERVAL_MS, Math.round(parsed * 1000));
};

const presetEndpoints = parseEndpoints(import.meta.env.VITE_PRESET_ENDPOINTS);

const pingEndpoint = async (url) => {
  const started = performance.now();
  try {
    await fetch(url, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      keepalive: true,
    });
    const latency = Math.round(performance.now() - started);
    console.info(`[keepalive] ${url} responded (approx. ${latency} ms)`);
  } catch (error) {
    console.error(`[keepalive] ${url} ping failed`, error);
  }
};

function App() {
  useEffect(() => {
    if (presetEndpoints.length === 0) {
      console.warn(
        "[keepalive] No endpoints configured. Set VITE_PRESET_ENDPOINTS in your .env file."
      );
      return;
    }

    let isActive = true;

    const pingAll = async () => {
      await Promise.all(presetEndpoints.map((url) => pingEndpoint(url)));
    };

    void pingAll();

    const intervalMs = getIntervalMs();
    console.info(
      `[keepalive] Watching ${
        presetEndpoints.length
      } endpoint(s) every ${Math.round(intervalMs / 1000)} seconds.`
    );

    const intervalId = window.setInterval(() => {
      if (!isActive) {
        return;
      }
      void pingAll();
    }, intervalMs);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, []);

  return null;
}

export default App;
