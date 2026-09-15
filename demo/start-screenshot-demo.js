const http = require("http");
function make(name, port) {
  http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ service: name, status: "ok" }));
  }).listen(port, () => console.log(`[demo] ${name} on ${port}`));
}
make("Core Router - Lagos HQ", 4001);
make("Web Server - Customer Portal", 4002);
make("Branch Office Gateway - Abuja", 4003);
