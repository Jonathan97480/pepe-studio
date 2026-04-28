import { spawn } from "node:child_process";
import net from "node:net";
import process from "node:process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const useShell = process.platform === "win32";
const nextPort = 3000;
const cwd = process.cwd();
const children = [];

function isPortInUse(port) {
    return new Promise((resolve) => {
        const server = net.createServer();

        server.once("error", (error) => {
            if (error && error.code === "EADDRINUSE") {
                resolve(true);
                return;
            }
            resolve(false);
        });

        server.once("listening", () => {
            server.close(() => resolve(false));
        });

        server.listen(port);
    });
}

function shutdown(code = 0) {
    for (const child of children) {
        if (!child.killed) {
            child.kill("SIGTERM");
        }
    }
    process.exit(code);
}

function start(name, args) {
    const child = useShell
        ? spawn(`${npmCommand} ${args.join(" ")}`, {
            cwd,
            stdio: "inherit",
            env: process.env,
            shell: true,
        })
        : spawn(npmCommand, args, {
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

async function main() {
    const portInUse = await isPortInUse(nextPort);

    if (portInUse) {
        console.log(`[tauri-dev] port ${nextPort} already in use, skipping next-dev startup`);
        start("tauri-run", ["run", "tauri:run"]);
        return;
    }

    start("next-dev", ["run", "dev"]);
    setTimeout(() => start("tauri-run", ["run", "tauri:run"]), 3000);
}

main();

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
