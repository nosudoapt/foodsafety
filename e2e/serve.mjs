import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const next = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const build = spawnSync(process.execPath, [next, "build"], { stdio: "inherit", env: process.env });
if (build.status !== 0) process.exit(build.status ?? 1);

const server = spawn(process.execPath, ["--import", fileURLToPath(new URL("./provider-fixture.mjs", import.meta.url)), next, "start", "--hostname", "127.0.0.1", "-p", "5101"], { stdio: "inherit", env: process.env });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code) => process.exit(code ?? 0));
