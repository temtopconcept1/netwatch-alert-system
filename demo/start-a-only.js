const http = require("http");
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ service: "Demo Web Server A", status: "ok" }));
  })
  .listen(4001, () => console.log("[demo] A only on 4001"));
