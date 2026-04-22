#!/usr/bin/env node

const fs = require("fs/promises");
const http = require("http");
const path = require("path");

const MAX_BODY_BYTES = 20 * 1024 * 1024;

function parseArgs(argv) {
  const config = {
    dir: process.env.COUNTDOWN_SYNC_DIR || path.join(process.cwd(), "countdown-csv-sync"),
    host: process.env.COUNTDOWN_SYNC_HOST || "127.0.0.1",
    port: Number(process.env.COUNTDOWN_SYNC_PORT) || 8787,
    token: process.env.COUNTDOWN_SYNC_TOKEN || ""
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--dir" && next) {
      config.dir = next;
      index += 1;
      continue;
    }

    if (arg === "--port" && next) {
      config.port = Number(next) || config.port;
      index += 1;
      continue;
    }

    if (arg === "--host" && next) {
      config.host = next;
      index += 1;
      continue;
    }

    if (arg === "--token" && next) {
      config.token = next;
      index += 1;
      continue;
    }

    if (!arg.startsWith("--")) {
      config.dir = arg;
    }
  }

  config.dir = path.resolve(config.dir);
  return config;
}

function addCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,X-CountDown-Token");
}

function sendJson(res, status, payload) {
  addCorsHeaders(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  addCorsHeaders(res);
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function getRequestToken(req) {
  return String(req.headers["x-countdown-token"] || "");
}

function isSafeCsvFilename(filename) {
  return (
    typeof filename === "string" &&
    filename.endsWith(".csv") &&
    filename === path.basename(filename) &&
    !filename.includes("..")
  );
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let byteLength = 0;

    req.on("data", (chunk) => {
      byteLength += chunk.length;
      if (byteLength > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function writeCsvFiles(targetDir, files) {
  await fs.mkdir(targetDir, { recursive: true });

  const written = [];
  for (const file of files) {
    if (!isSafeCsvFilename(file.filename)) {
      throw new Error(`Unsafe CSV filename: ${file.filename}`);
    }

    const targetPath = path.join(targetDir, file.filename);
    const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempPath, String(file.content || ""), "utf8");
    await fs.rename(tempPath, targetPath);
    written.push(file.filename);
  }

  return written;
}

async function readCsvFiles(targetDir) {
  await fs.mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(targetDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile() || !isSafeCsvFilename(entry.name)) {
      continue;
    }

    files.push({
      filename: entry.name,
      content: await fs.readFile(path.join(targetDir, entry.name), "utf8")
    });
  }

  return files;
}

async function handleRequest(config, req, res) {
  if (req.method === "OPTIONS") {
    addCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (config.token && getRequestToken(req) !== config.token) {
    sendText(res, 401, "Invalid sync token.");
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      dir: config.dir
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/files") {
    sendJson(res, 200, {
      ok: true,
      files: await readCsvFiles(config.dir)
    });
    return;
  }

  if (req.method !== "POST" || url.pathname !== "/sync") {
    sendText(res, 404, "Not found.");
    return;
  }

  const body = await readRequestBody(req);
  const payload = JSON.parse(body || "{}");
  const files = Array.isArray(payload.files) ? payload.files : [];
  if (!files.length) {
    throw new Error("No CSV files received.");
  }

  const written = await writeCsvFiles(config.dir, files);
  sendJson(res, 200, {
    ok: true,
    written
  });
}

function formatHostForUrl(host) {
  return host.includes(":") ? `[${host}]` : host;
}

function createSyncServer(config) {
  return http.createServer((req, res) => {
    handleRequest(config, req, res).catch((error) => {
      sendText(res, 400, error && error.message ? error.message : "Sync failed.");
    });
  });
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function listenOnLoopback(config) {
  const hosts = ["127.0.0.1", "::1"];
  const servers = [];
  const errors = [];

  for (const host of hosts) {
    const server = createSyncServer(config);
    try {
      await listen(server, config.port, host);
      servers.push({ server, host });
      console.log(`CountDown Pro CSV sync server listening on http://${formatHostForUrl(host)}:${config.port}/sync`);
    } catch (error) {
      errors.push(`${host}: ${error && error.message ? error.message : error}`);
    }
  }

  if (!servers.length) {
    throw new Error(`Could not bind sync server to loopback. ${errors.join(" ")}`);
  }

  if (errors.length) {
    console.warn(`Some loopback addresses were unavailable. ${errors.join(" ")}`);
  }

  return servers;
}

async function main() {
  const config = parseArgs(process.argv);
  await fs.mkdir(config.dir, { recursive: true });

  if (config.host === "loopback") {
    await listenOnLoopback(config);
  } else {
    const server = createSyncServer(config);
    await listen(server, config.port, config.host);
    console.log(`CountDown Pro CSV sync server listening on http://${formatHostForUrl(config.host)}:${config.port}/sync`);
  }

  console.log(`Writing CSV files to ${config.dir}`);
  if (config.token) {
    console.log("Token protection is enabled.");
  }
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
