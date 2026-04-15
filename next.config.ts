const withPWA = require("@ducanh2912/next-pwa").default;

const pwa = withPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
});

module.exports = pwa({
  // your existing next.js config options here
});