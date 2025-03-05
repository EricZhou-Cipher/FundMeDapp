// scripts/openBrowser.js
const open = require("open");

(async () => {
  const url = "http://localhost:3000";
  console.log(`🌐 自动打开浏览器: ${url}`);
  await open(url);
})();
