// Loaded only by the browser-test server. Production always calls Resend.
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url === "https://api.resend.com/emails") return originalFetch("http://127.0.0.1:5102/__test/send-email", options);
  return originalFetch(input, options);
};
