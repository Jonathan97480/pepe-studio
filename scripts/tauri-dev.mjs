import { spawn } from "node:child_process";
import process from "node:process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const cwd = process.cwd();
const children = [];

function shutdown(code = 0) {
    for (const child of children) {
        if (!child.killed) {
            child.kill("SIGTERM");
        }
    }
    process.exit(code);
}

function start(name, args) {
    const child = spawn(npmCommand, args, {
        cwd,
        stdio: "inherit",
        env: process.env,
        shell: false,
    });

    child.on("exit", (code) => {
        const normalizedCode = code ?? 0;
        if (normalizedCode !== 0) {
            console.error(`[tauri-dev] ${name} exited with code ${normalizedCode}`);
        }
        shutdown(normalizedCode);
    });

    child.on("error", (error) => {
        console.error(`[tauri-dev] failed to start ${name}:`, error);
        shutdown(1);
    });

    children.push(child);
    return child;
}

start("next-dev", ["run", "dev"]);
setTimeout(() => start("tauri-run", ["run", "tauri:run"]), 3000);

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
