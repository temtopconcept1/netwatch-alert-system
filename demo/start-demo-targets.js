// start-demo-targets.js — spins up two dummy HTTP "devices" (ports 4001 & 4002)
// so the monitoring system has something real to poll during local testing/demo.
// In production, "target" fields would point at real routers, servers, or
// service endpoints on the actual network being monitored.
const http = require("http");

function makeServer(name, port) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ service: name, status: "ok", time: new Date().toISOString() }));
  });
  server.listen(port, () => console.log(`[demo] ${name} listening on ${port}`));
  return server;
}

makeServer("Demo Web Server A", 4001);
makeServer("Demo Web Server B", 4002);
