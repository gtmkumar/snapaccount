/**
 * Expo dynamic config — merges app.json and applies dev overrides.
 *
 * API base URL resolution (first match wins):
 *   1. EXPO_PUBLIC_API_BASE_URL  (.env.local — use LAN IP on physical devices)
 *   2. app.json extra.apiBaseUrl (default http://localhost:5000 for simulators)
 *
 * Gateway routes are /auth/…, /gst/… — NOT /api/auth/… (admin Vite strips /api).
 */
const app = require('./app.json');

/** @param {string} url */
function normalizeGatewayBaseUrl(url) {
  const trimmed = url.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed.slice(0, -4) : trimmed;
}

module.exports = () => ({
  expo: {
    ...app.expo,
    extra: {
      ...app.expo.extra,
      apiBaseUrl: normalizeGatewayBaseUrl(
        process.env.EXPO_PUBLIC_API_BASE_URL ?? app.expo.extra.apiBaseUrl,
      ),
      ...(process.env.EXPO_PUBLIC_CHAT_BASE_URL
        ? { chatBaseUrl: normalizeGatewayBaseUrl(process.env.EXPO_PUBLIC_CHAT_BASE_URL) }
        : {}),
    },
  },
});
