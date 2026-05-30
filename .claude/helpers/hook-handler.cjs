#!/usr/bin/env node
/**
 * Claude Flow Hook Handler (Cross-Platform)
 * Dispatches hook events to the appropriate helper modules.
 *
 * PreToolUse hook contract (Claude Code):
 *   stdout must be EMPTY (= allow) or valid JSON (= structured decision).
 *   Plain-text stdout causes "returned invalid JSON → blocked for safety".
 *   Use process.stderr for all diagnostic/info output from PreToolUse handlers.
 *   PostToolUse / SessionStart / SessionEnd handlers may write to stderr freely.
 */

const path = require("path");
const fs = require("fs");

const helpersDir = __dirname;

function safeRequire(modulePath) {
  try {
    if (fs.existsSync(modulePath)) {
      const origLog = console.log;
      const origError = console.error;
      console.log = () => {};
      console.error = () => {};
      try {
        const mod = require(modulePath);
        return mod;
      } finally {
        console.log = origLog;
        console.error = origError;
      }
    }
  } catch (e) {
    // silently fail
  }
  return null;
}

const router = safeRequire(path.join(helpersDir, "router.cjs"));
const session = safeRequire(path.join(helpersDir, "session.cjs"));
const memory = safeRequire(path.join(helpersDir, "memory.cjs"));
const intelligence = safeRequire(path.join(helpersDir, "intelligence.cjs"));

// ── Intelligence timeout protection (fixes #1530, #1531) ───────────────────
var INTELLIGENCE_TIMEOUT_MS = 3000;
function runWithTimeout(fn, label) {
  return new Promise(function (resolve) {
    var timer = setTimeout(function () {
      process.stderr.write(
        "[WARN] " + label + " timed out after " + INTELLIGENCE_TIMEOUT_MS + "ms, skipping\n"
      );
      resolve(null);
    }, INTELLIGENCE_TIMEOUT_MS);
    try {
      var result = fn();
      clearTimeout(timer);
      resolve(result);
    } catch (e) {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

const [, , command, ...args] = process.argv;

async function readStdin() {
  if (process.stdin.isTTY) return "";
  return new Promise((resolve) => {
    let data = "";
    const timer = setTimeout(() => {
      process.stdin.removeAllListeners();
      process.stdin.pause();
      resolve(data);
    }, 500);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => { clearTimeout(timer); resolve(data); });
    process.stdin.on("error", () => { clearTimeout(timer); resolve(data); });
    process.stdin.resume();
  });
}

async function main() {
  var safetyTimer = setTimeout(function () {
    process.stderr.write("[WARN] Hook handler global timeout (5s), forcing exit\n");
    process.exit(0);
  }, 5000);
  safetyTimer.unref();

  let stdinData = "";
  try { stdinData = await readStdin(); } catch (e) { /* ignore */ }

  let hookInput = {};
  if (stdinData.trim()) {
    try { hookInput = JSON.parse(stdinData); } catch (e) { /* ignore */ }
  }

  var toolInput = hookInput.toolInput || hookInput.tool_input || {};
  var toolName = hookInput.toolName || hookInput.tool_name || "";
  var prompt =
    hookInput.prompt ||
    hookInput.command ||
    toolInput.command ||
    process.env.PROMPT ||
    process.env.TOOL_INPUT_command ||
    "";

  const handlers = {

    // ── UserPromptSubmit ── stderr only, no stdout ──────────────────────────
    route: () => {
      if (intelligence && intelligence.getContext) {
        try {
          const ctx = intelligence.getContext(prompt);
          if (ctx) process.stderr.write(ctx + "\n");
        } catch (e) { /* non-fatal */ }
      }
      if (router && router.routeTask) {
        const result = router.routeTask(prompt);
        const lines = [
          "[INFO] Routing task: " + (prompt.substring(0, 80) || "(no prompt)"),
          "",
          "+------------------- Primary Recommendation -------------------+",
          "| Agent: " + result.agent.padEnd(53) + "|",
          "| Confidence: " + (result.confidence * 100).toFixed(1) + "%" + " ".repeat(44) + "|",
          "| Reason: " + result.reason.substring(0, 53).padEnd(53) + "|",
          "+--------------------------------------------------------------+",
        ];
        process.stderr.write(lines.join("\n") + "\n");
      } else {
        process.stderr.write("[INFO] Router not available, using default routing\n");
      }
    },

    // ── PreToolUse: Bash ── stdout must be EMPTY or valid JSON ─────────────
    "pre-bash": () => {
      var cmd = String(hookInput.command || toolInput.command || prompt || "").toLowerCase();
      var dangerous = ["rm -rf /", "format c:", "del /s /q c:\\", ":(){:|:&};:"];
      for (var i = 0; i < dangerous.length; i++) {
        if (cmd.includes(dangerous[i])) {
          process.stdout.write(
            JSON.stringify({ decision: "block", reason: "Dangerous command detected: " + dangerous[i] }) + "\n"
          );
          process.exit(2);
        }
      }
      // Empty stdout = allow
    },

    // ── PreToolUse: Write|Edit|MultiEdit ── stdout must be EMPTY or JSON ───
    "pre-edit": () => {
      // No blocking logic needed — empty stdout = allow
    },

    // ── PostToolUse: Write|Edit|MultiEdit ── stderr only ───────────────────
    "post-edit": () => {
      if (session && session.metric) {
        try { session.metric("edits"); } catch (e) { /* no active session */ }
      }
      if (intelligence && intelligence.recordEdit) {
        try {
          var file =
            hookInput.file_path ||
            toolInput.file_path ||
            process.env.TOOL_INPUT_file_path ||
            args[0] ||
            "";
          intelligence.recordEdit(file);
        } catch (e) { /* non-fatal */ }
      }
      process.stderr.write("[OK] Edit recorded\n");
    },

    // ── SessionStart ── stderr only ────────────────────────────────────────
    "session-restore": async () => {
      if (session) {
        var existing = session.restore && session.restore();
        if (!existing) { session.start && session.start(); }
      } else {
        process.stderr.write("[OK] Session restored: session-" + Date.now() + "\n");
      }
      if (intelligence && intelligence.init) {
        var initResult = await runWithTimeout(() => intelligence.init(), "intelligence.init()");
        if (initResult && initResult.nodes > 0) {
          process.stderr.write(
            "[INTELLIGENCE] Loaded " + initResult.nodes + " patterns, " + initResult.edges + " edges\n"
          );
        }
      }
    },

    // ── SessionEnd ── stderr only ──────────────────────────────────────────
    "session-end": async () => {
      if (intelligence && intelligence.consolidate) {
        var consResult = await runWithTimeout(() => intelligence.consolidate(), "intelligence.consolidate()");
        if (consResult && consResult.entries > 0) {
          var msg =
            "[INTELLIGENCE] Consolidated: " + consResult.entries + " entries, " + consResult.edges + " edges";
          if (consResult.newEntries > 0) msg += ", " + consResult.newEntries + " new";
          msg += ", PageRank recomputed";
          process.stderr.write(msg + "\n");
        }
      }
      if (session && session.end) {
        session.end();
      } else {
        process.stderr.write("[OK] Session ended\n");
      }
    },

    // ── SubagentStart ── stdout must be EMPTY or JSON ──────────────────────
    "pre-task": () => {
      if (session && session.metric) {
        try { session.metric("tasks"); } catch (e) { /* no active session */ }
      }
      if (router && router.routeTask && prompt) {
        var result = router.routeTask(prompt);
        process.stderr.write(
          "[INFO] Task routed to: " + result.agent + " (confidence: " + result.confidence + ")\n"
        );
      }
      // Empty stdout = allow
    },

    // ── SubagentStop ── stderr only ────────────────────────────────────────
    "post-task": () => {
      if (intelligence && intelligence.feedback) {
        try { intelligence.feedback(true); } catch (e) { /* non-fatal */ }
      }
      process.stderr.write("[OK] Task completed\n");
    },

    // ── PreCompact ── stderr only ──────────────────────────────────────────
    "compact-manual": () => {
      process.stderr.write([
        "PreCompact Guidance:",
        "IMPORTANT: Review CLAUDE.md in project root for:",
        "   - Available agents and concurrent usage patterns",
        "   - Swarm coordination strategies (hierarchical, mesh, adaptive)",
        "   - Critical concurrent execution rules (1 MESSAGE = ALL OPERATIONS)",
        "Ready for compact operation",
      ].join("\n") + "\n");
    },

    "compact-auto": () => {
      process.stderr.write([
        "Auto-Compact Guidance (Context Window Full):",
        "CRITICAL: Before compacting, ensure you understand:",
        "   - All agents available in .claude/agents/ directory",
        "   - Concurrent execution patterns from CLAUDE.md",
        "   - Swarm coordination strategies for complex tasks",
        "Apply GOLDEN RULE: Always batch operations in single messages",
        "Auto-compact proceeding with full agent context",
      ].join("\n") + "\n");
    },

    // ── SubagentStart ── stdout must be EMPTY or JSON ──────────────────────
    status: () => {
      // Empty stdout = allow
      process.stderr.write("[OK] Status check\n");
    },

    stats: () => {
      if (intelligence && intelligence.stats) {
        intelligence.stats(args.includes("--json"));
      } else {
        process.stderr.write("[WARN] Intelligence module not available. Run session-restore first.\n");
      }
    },
  };

  if (command && handlers[command]) {
    try {
      await Promise.resolve(handlers[command]());
    } catch (e) {
      process.stderr.write("[WARN] Hook " + command + " encountered an error: " + e.message + "\n");
    }
  } else if (command) {
    // Unknown hook command — write to stderr only so PreToolUse hooks
    // (e.g. any future pre-* command) never produce invalid JSON on stdout.
    process.stderr.write("[OK] Hook: " + command + "\n");
  } else {
    process.stderr.write(
      "Usage: hook-handler.cjs <route|pre-bash|pre-edit|post-edit|session-restore|session-end|pre-task|post-task|compact-manual|compact-auto|status|stats>\n"
    );
  }
}

main()
  .catch(function (e) {
    process.stderr.write("[WARN] Hook handler error: " + e.message + "\n");
  })
  .finally(function () {
    process.exit(0);
  });
