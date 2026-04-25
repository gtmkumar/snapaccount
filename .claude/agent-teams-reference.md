# Agent Teams Master Reference Guide

> Coordinate multiple Claude Code instances working together as a team, with shared tasks, inter-agent messaging, and centralized management.

---

## Table of Contents

- [Overview](#overview)
- [When to Use Agent Teams](#when-to-use-agent-teams)
- [Agent Teams vs Subagents](#agent-teams-vs-subagents)
- [Enabling Agent Teams](#enabling-agent-teams)
- [Architecture](#architecture)
- [Tools Reference](#tools-reference)
  - [TeamCreate](#teamcreate)
  - [TeamDelete](#teamdelete)
  - [Agent (for spawning teammates)](#agent-tool-for-spawning-teammates)
  - [SendMessage](#sendmessage)
- [Team Workflow Lifecycle](#team-workflow-lifecycle)
- [Display Modes](#display-modes)
- [Task Coordination](#task-coordination)
- [Communication Patterns](#communication-patterns)
- [Plan Approval Workflow](#plan-approval-workflow)
- [Permissions](#permissions)
- [Best Practices](#best-practices)
- [Prompt Templates](#prompt-templates)
- [Troubleshooting](#troubleshooting)
- [Limitations](#limitations)

---

## Overview

Agent teams let you coordinate multiple Claude Code instances working together. One session acts as the **team lead**, coordinating work, assigning tasks, and synthesizing results. **Teammates** work independently, each in its own context window, and communicate directly with each other.

Unlike subagents (which run within a single session and can only report back to the main agent), you can interact with individual teammates directly without going through the lead.

**Requirements:** Claude Code v2.1.32 or later.

---

## When to Use Agent Teams

Agent teams are most effective for tasks where **parallel exploration adds real value**:

| Use Case | Why It Works |
|---|---|
| **Research and review** | Multiple teammates investigate different aspects simultaneously, then share and challenge each other's findings |
| **New modules or features** | Teammates each own a separate piece without stepping on each other |
| **Debugging with competing hypotheses** | Teammates test different theories in parallel and converge on the answer faster |
| **Cross-layer coordination** | Changes that span frontend, backend, and tests, each owned by a different teammate |

### When NOT to Use Agent Teams

Agent teams add coordination overhead and use significantly more tokens than a single session. Avoid them for:

- Sequential tasks where each step depends on the previous
- Same-file edits (two teammates editing the same file leads to overwrites)
- Work with many tight dependencies
- Routine or trivial tasks

For these, a single session or subagents are more effective.

---

## Agent Teams vs Subagents

|  | Subagents | Agent Teams |
|---|---|---|
| **Context** | Own context window; results return to the caller | Own context window; fully independent |
| **Communication** | Report results back to the main agent only | Teammates message each other directly |
| **Coordination** | Main agent manages all work | Shared task list with self-coordination |
| **Best for** | Focused tasks where only the result matters | Complex work requiring discussion and collaboration |
| **Token cost** | Lower: results summarized back to main context | Higher: each teammate is a separate Claude instance |

**Rule of thumb:** Use subagents when you need quick, focused workers that report back. Use agent teams when teammates need to share findings, challenge each other, and coordinate on their own.

---

## Enabling Agent Teams

Agent teams are disabled by default. Enable by setting the `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` environment variable to `1`:

### Via settings.json

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### Via shell environment

```bash
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```

---

## Architecture

An agent team consists of four components:

| Component | Role |
|---|---|
| **Team lead** | The main Claude Code session that creates the team, spawns teammates, and coordinates work |
| **Teammates** | Separate Claude Code instances that each work on assigned tasks |
| **Task list** | Shared list of work items that teammates claim and complete |
| **Mailbox** | Messaging system for communication between agents |

### Storage Locations

- **Team config:** `~/.claude/teams/{team-name}/config.json`
- **Task list:** `~/.claude/tasks/{team-name}/`

The team config contains a `members` array with each teammate's:
- `name` - Human-readable name (always use this for messaging and task assignment)
- `agentId` - Unique identifier (for reference only)
- `agentType` - Role/type of the agent

---

## Tools Reference

### TeamCreate

Creates a new team to coordinate multiple agents working on a project. Teams have a 1:1 correspondence with task lists (Team = TaskList).

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `team_name` | string | Yes | Name for the new team to create |
| `description` | string | No | Team description/purpose |
| `agent_type` | string | No | Type/role of the team lead (e.g., "researcher", "test-runner"). Used for team file and inter-agent coordination |

**What it creates:**
- A team file at `~/.claude/teams/{team-name}.json`
- A corresponding task list directory at `~/.claude/tasks/{team-name}/`

**Example:**
```json
{
  "team_name": "auth-refactor",
  "description": "Refactoring the authentication module",
  "agent_type": "coordinator"
}
```

---

### TeamDelete

Removes team and task directories when work is complete. Takes no parameters -- uses the current session's team context.

**What it removes:**
- The team directory (`~/.claude/teams/{team-name}/`)
- The task directory (`~/.claude/tasks/{team-name}/`)
- Clears team context from the current session

**Important:** TeamDelete will **fail** if the team still has active members. Gracefully terminate all teammates first via shutdown requests.

---

### Agent Tool (for Spawning Teammates)

When used with `team_name` and `name` parameters, the Agent tool spawns a teammate that joins an existing team.

**Key Parameters for Team Spawning:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `prompt` | string | Yes | The task for the agent to perform |
| `description` | string | Yes | Short 3-5 word summary |
| `team_name` | string | No | Team name for spawning. Uses current team context if omitted |
| `name` | string | No | Name for the spawned agent. Makes it addressable via SendMessage |
| `subagent_type` | string | No | The type of specialized agent to use |
| `model` | string | No | Model override: `"sonnet"`, `"opus"`, or `"haiku"` |
| `mode` | string | No | Permission mode: `"plan"`, `"default"`, `"acceptEdits"`, `"bypassPermissions"`, `"dontAsk"`, `"auto"` |
| `run_in_background` | boolean | No | Set to true to run agent in background |
| `isolation` | string | No | Set to `"worktree"` for isolated git worktree |

**Choosing Agent Types for Teammates:**

- **Read-only agents** (e.g., `Explore`, `Plan`) -- cannot edit or write files. Only assign research, search, or planning tasks.
- **Full-capability agents** (e.g., `general-purpose`) -- have access to all tools including file editing, writing, and bash. Use for implementation work.
- **Custom agents** defined in `.claude/agents/` -- may have their own tool restrictions.

**Example -- Spawn a teammate:**
```json
{
  "description": "Review auth security",
  "prompt": "Review the authentication module at src/auth/ for security vulnerabilities. Focus on token handling, session management, and input validation.",
  "team_name": "auth-review",
  "name": "security-reviewer",
  "subagent_type": "general-purpose",
  "model": "sonnet"
}
```

---

### SendMessage

Sends messages to agent teammates and handles protocol requests/responses.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `to` | string | Yes | Recipient: teammate name, or `"*"` for broadcast |
| `message` | string or object | Yes | Plain text message or structured protocol object |
| `summary` | string | No | 5-10 word preview shown in UI (required when message is a string) |

#### Addressing

| Address | Meaning |
|---|---|
| `"researcher"` | Direct message to the teammate named "researcher" |
| `"*"` | Broadcast to all teammates (except yourself) |

**Important:** Structured protocol messages (shutdown, plan approval) cannot be broadcast -- they require a specific recipient name.

#### Plain Text Message

```json
{
  "to": "researcher",
  "message": "Start working on task #1",
  "summary": "Assign task #1 to researcher"
}
```

#### Broadcast (Use Sparingly)

```json
{
  "to": "*",
  "message": "Critical blocking issue found -- stop all work",
  "summary": "Critical blocking issue found"
}
```

Broadcasting sends a separate message to every teammate. Costs scale linearly with team size. Only use for critical, team-wide announcements.

#### Shutdown Request

```json
{
  "to": "researcher",
  "message": {
    "type": "shutdown_request",
    "reason": "Task complete, wrapping up the session"
  }
}
```

#### Shutdown Response (Approve)

```json
{
  "to": "team-lead",
  "message": {
    "type": "shutdown_response",
    "request_id": "abc-123",
    "approve": true
  }
}
```

#### Shutdown Response (Reject)

```json
{
  "to": "team-lead",
  "message": {
    "type": "shutdown_response",
    "request_id": "abc-123",
    "approve": false,
    "reason": "Still working on task #3, need 5 more minutes"
  }
}
```

#### Plan Approval Response (Approve)

```json
{
  "to": "researcher",
  "message": {
    "type": "plan_approval_response",
    "request_id": "abc-123",
    "approve": true
  }
}
```

#### Plan Approval Response (Reject)

```json
{
  "to": "researcher",
  "message": {
    "type": "plan_approval_response",
    "request_id": "abc-123",
    "approve": false,
    "feedback": "Please add error handling for the API calls"
  }
}
```

---

## Team Workflow Lifecycle

The complete lifecycle of an agent team:

### 1. Create the Team

Use `TeamCreate` to create the team and its task list.

### 2. Create Tasks

Use task tools (`TaskCreate`, `TaskList`, etc.) to populate the shared task list. Tasks automatically use the team's task list.

### 3. Spawn Teammates

Use the `Agent` tool with `team_name` and `name` parameters to create teammates that join the team.

### 4. Assign Tasks

Use `TaskUpdate` with `owner` to assign tasks to idle teammates. Teammates can also self-claim unassigned, unblocked tasks.

### 5. Teammates Work

Teammates work on assigned tasks and mark them completed via `TaskUpdate`. After each turn, teammates automatically go idle and send a notification.

### 6. Communication

Teammates send messages when they complete tasks or need help. Messages are delivered automatically -- no polling needed.

### 7. Shutdown

When work is complete, send shutdown requests to all teammates via `SendMessage` with `message: {type: "shutdown_request"}`.

### 8. Clean Up

After all teammates have shut down, use `TeamDelete` to remove team and task directories.

**Important:** Always use the lead to clean up. Teammates should not run cleanup because their team context may not resolve correctly.

---

## Display Modes

### In-Process Mode (Default)

All teammates run inside your main terminal.

- **Shift+Down**: Cycle through teammates
- **Enter**: View a teammate's session
- **Escape**: Interrupt a teammate's current turn
- **Ctrl+T**: Toggle the task list

### Split Pane Mode

Each teammate gets its own pane. Requires **tmux** or **iTerm2**.

#### Configuration

```json
{
  "teammateMode": "in-process"
}
```

Options: `"auto"` (default), `"in-process"`, `"tmux"`

#### CLI Override

```bash
claude --teammate-mode in-process
```

#### Requirements for Split Panes

- **tmux**: Install via your system's package manager
- **iTerm2**: Install the `it2` CLI, then enable Python API in iTerm2 Settings > General > Magic > Enable Python API

---

## Task Coordination

### Task States

Tasks have three states: **pending**, **in progress**, and **completed**.

### Task Dependencies

Tasks can depend on other tasks. A pending task with unresolved dependencies cannot be claimed until those dependencies are completed. The system manages dependencies automatically -- when a task completes, blocked tasks unblock without manual intervention.

### Task Assignment

- **Lead assigns**: Tell the lead which task to give to which teammate
- **Self-claim**: After finishing a task, a teammate picks up the next unassigned, unblocked task

Task claiming uses **file locking** to prevent race conditions when multiple teammates try to claim the same task simultaneously.

### Task Coordination Best Practices for Teammates

1. Check `TaskList` periodically, especially after completing each task
2. Claim unassigned, unblocked tasks with `TaskUpdate` (set `owner` to your name)
3. Prefer tasks in **ID order** (lowest first) -- earlier tasks often set up context for later ones
4. Create new tasks with `TaskCreate` when identifying additional work
5. Mark tasks as completed with `TaskUpdate` when done
6. If all available tasks are blocked, notify the team lead or help resolve blocking tasks

---

## Communication Patterns

### Automatic Message Delivery

Messages from teammates are automatically delivered. The lead does NOT need to poll for updates.

### Idle State

Teammates go idle after every turn -- this is completely normal.

- Idle teammates **can** receive messages (sending a message wakes them up)
- Idle notifications are automatic
- Do NOT treat idle as an error
- Peer DM summaries are included in idle notifications (informational only)

### Communication Rules

- Plain text output is NOT visible to the team. Always use `SendMessage` to communicate.
- Always refer to teammates by **name**, never by UUID.
- Do NOT send structured JSON status messages. Use `TaskUpdate` for task completion.
- Default to **direct messages**. Only use broadcast for critical team-wide issues.

---

## Plan Approval Workflow

For complex or risky tasks, require teammates to plan before implementing:

1. Spawn teammate with `mode: "plan"` -- they work in read-only plan mode
2. Teammate finishes planning and sends a plan approval request to the lead
3. Lead reviews and either approves or rejects with feedback
4. If rejected, teammate revises and resubmits
5. Once approved, teammate exits plan mode and begins implementation

The lead makes approval decisions autonomously. Influence judgment with criteria in your prompt:
- "Only approve plans that include test coverage"
- "Reject plans that modify the database schema"

---

## Permissions

- Teammates start with the **lead's permission settings**
- If the lead runs with `--dangerously-skip-permissions`, all teammates do too
- After spawning, you can change individual teammate modes
- You cannot set per-teammate modes at spawn time

**Tip:** Pre-approve common operations in your permission settings before spawning teammates to reduce interruptions.

---

## Best Practices

### 1. Give Teammates Enough Context

Teammates load project context (CLAUDE.md, MCP servers, skills) but NOT the lead's conversation history. Include task-specific details in the spawn prompt.

### 2. Choose Appropriate Team Size

- Start with **3-5 teammates** for most workflows
- Aim for **5-6 tasks per teammate**
- Token costs scale linearly with teammate count
- Three focused teammates often outperform five scattered ones

### 3. Size Tasks Appropriately

| Size | Problem |
|---|---|
| Too small | Coordination overhead exceeds the benefit |
| Too large | Teammates work too long without check-ins |
| Just right | Self-contained units with a clear deliverable (a function, a test file, a review) |

### 4. Avoid File Conflicts

Break work so each teammate owns a **different set of files**. Two teammates editing the same file leads to overwrites.

### 5. Wait for Teammates

If the lead starts implementing instead of delegating, tell it:
> "Wait for your teammates to complete their tasks before proceeding"

### 6. Monitor and Steer

Check in on progress, redirect approaches that aren't working, and synthesize findings as they come in. Don't let a team run unattended for too long.

### 7. Start with Research and Review

If new to agent teams, start with non-code tasks: reviewing a PR, researching a library, or investigating a bug.

### 8. Use Hooks for Quality Gates

- **`TeammateIdle`**: Runs when a teammate is about to go idle. Exit with code 2 to send feedback and keep them working.
- **`TaskCompleted`**: Runs when a task is being marked complete. Exit with code 2 to prevent completion and send feedback.

---

## Prompt Templates

### Parallel Code Review

```
Create an agent team to review PR #142. Spawn three reviewers:
- One focused on security implications
- One checking performance impact
- One validating test coverage
Have them each review and report findings.
```

### Competing Hypothesis Investigation

```
Users report the app exits after one message instead of staying connected.
Spawn 5 agent teammates to investigate different hypotheses. Have them talk to
each other to try to disprove each other's theories, like a scientific
debate. Update the findings doc with whatever consensus emerges.
```

### Multi-Perspective Research

```
I'm designing a CLI tool that helps developers track TODO comments across
their codebase. Create an agent team to explore this from different angles: one
teammate on UX, one on technical architecture, one playing devil's advocate.
```

### Parallel Module Implementation

```
Create a team with 4 teammates to refactor these modules in parallel.
Use Sonnet for each teammate.
```

### Plan-Required Teammate

```
Spawn an architect teammate to refactor the authentication module.
Require plan approval before they make any changes.
```

### Detailed Spawn Prompt

```
Spawn a security reviewer teammate with the prompt: "Review the authentication
module at src/auth/ for security vulnerabilities. Focus on token handling,
session management, and input validation. The app uses JWT tokens stored in
httpOnly cookies. Report any issues with severity ratings."
```

---

## Troubleshooting

### Teammates Not Appearing

- In in-process mode, press **Shift+Down** to cycle through active teammates
- Check that your task was complex enough to warrant a team
- For split panes, verify tmux is installed: `which tmux`
- For iTerm2, verify `it2` CLI is installed and Python API is enabled

### Too Many Permission Prompts

Pre-approve common operations in your permission settings before spawning teammates.

### Teammates Stopping on Errors

Check their output via Shift+Down (in-process) or click the pane (split mode), then:
- Give them additional instructions directly
- Spawn a replacement teammate

### Lead Shuts Down Before Work Is Done

Tell it to keep going, or tell it to wait for teammates to finish before proceeding.

### Orphaned tmux Sessions

```bash
tmux ls
tmux kill-session -t <session-name>
```

---

## Limitations

- **No session resumption with in-process teammates**: `/resume` and `/rewind` do not restore in-process teammates. After resuming, tell the lead to spawn new ones.
- **Task status can lag**: Teammates sometimes fail to mark tasks completed. Check manually or nudge.
- **Shutdown can be slow**: Teammates finish their current request before shutting down.
- **One team per session**: Clean up the current team before starting a new one.
- **No nested teams**: Teammates cannot spawn their own teams. Only the lead can manage the team.
- **Lead is fixed**: Cannot promote a teammate to lead or transfer leadership.
- **Permissions set at spawn**: All teammates start with the lead's mode. Change individually after spawning.
- **Split panes require tmux or iTerm2**: Not supported in VS Code integrated terminal, Windows Terminal, or Ghostty.
- **CLAUDE.md works normally**: Teammates read CLAUDE.md files from their working directory.

---

## Quick Reference Card

```
ENABLE:   settings.json -> "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }
CREATE:   TeamCreate { team_name, description, agent_type }
SPAWN:    Agent { prompt, description, team_name, name, model, mode }
MESSAGE:  SendMessage { to: "name", message: "...", summary: "..." }
BROADCAST: SendMessage { to: "*", message: "..." }
SHUTDOWN: SendMessage { to: "name", message: { type: "shutdown_request" } }
CLEANUP:  TeamDelete {}

NAVIGATE: Shift+Down (cycle teammates), Enter (view), Escape (interrupt), Ctrl+T (tasks)

IDEAL SIZE: 3-5 teammates, 5-6 tasks each
MODELS:    "opus", "sonnet", "haiku"
MODES:     "plan", "default", "acceptEdits", "bypassPermissions", "dontAsk", "auto"
```
