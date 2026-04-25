# SignalR Backplane Decision — Redis via Memorystore

**Phase:** 6F  
**Status:** Decided — implemented  
**Owner:** devops-engineer (infra), backend-agent (application wiring)

---

## Decision

ChatService uses **Microsoft.AspNetCore.SignalR.StackExchangeRedis** as the SignalR backplane, backed by Google Cloud Memorystore for Redis (asia-south1, private IP).

---

## Why Redis backplane is required

Cloud Run scales horizontally. Multiple ChatService instances run in parallel when load increases. Without a backplane:

- A SignalR group (e.g., a chat conversation between User A and User B) is only known to the instance that established the connection.
- If User A is on instance 1 and User B is on instance 2, a message sent by User A to the group will never reach User B — instance 1 has no knowledge of instance 2's connections.

With the Redis backplane:

- All instances publish outbound messages to a shared Redis channel.
- All instances subscribe to that channel and fan-out to their locally connected clients.
- Chat groups, typing indicators, and read receipts work across all instances.

This is the standard pattern for horizontally scaled SignalR: [Microsoft docs — Scale out with Redis](https://learn.microsoft.com/en-us/aspnet/core/signalr/redis-backplane).

---

## Architecture

```
  Client A           Client B
     |                  |
  [Cloud Run          [Cloud Run
   ChatService          ChatService
   Instance 1]          Instance 2]
     |       \        /    |
     |        \      /     |
     |         [Redis]     |
     |      Memorystore    |
     |      (asia-south1)  |
     |                     |
  fan-out via            fan-out via
  Redis channel          Redis channel
```

**Session affinity layer (Cloud Run):** `--session-affinity` is set on the ChatService Cloud Run deployment. Cloud Run sets a cookie (`_gcss`) on the first response. Subsequent requests (including the WebSocket upgrade) from the same client are routed to the same instance. This ensures:

1. The SignalR negotiate handshake and subsequent WebSocket frames land on the same instance.
2. The Redis backplane is a correctness guarantee for cross-client fan-out, not a workaround for missing sticky sessions.

---

## NuGet package

```
Microsoft.AspNetCore.SignalR.StackExchangeRedis
```

**backend-agent wiring instructions:**

```csharp
// ChatService.Api / Program.cs
var redisConn = Environment.GetEnvironmentVariable("REDIS_CONNECTION_STRING")
    ?? throw new InvalidOperationException("REDIS_CONNECTION_STRING not set");

builder.Services
    .AddSignalR()
    .AddStackExchangeRedis(redisConn, options =>
    {
        options.Configuration.ChannelPrefix = RedisChannel.Literal("snapaccount");
    });
```

Connection string is injected from `REDIS_CONNECTION_STRING` env var (mounted from Secret Manager secret `redis-connection-string-prod` / `redis-connection-string-staging`).

Format: `<host>:<port>,abortConnect=false,connectTimeout=5000,syncTimeout=5000`

---

## Typing indicators and presence

Store in Redis using StackExchange.Redis `IDatabase` directly (not via SignalR backplane):

```
Key:    presence:{userId}
Value:  "typing"   (or "{conversationId}:{action}")
TTL:    30 seconds (EXPIRE command refreshed on each heartbeat from client)
```

Client sends a heartbeat every 20 seconds while typing. Server sets/refreshes the Redis key. Key auto-expires 30 seconds after the last heartbeat — no explicit cleanup needed.

**backend-agent:** inject `IConnectionMultiplexer` (registered via `StackExchange.Redis.Extensions` or directly via `ConnectionMultiplexer.Connect(redisConn)`).

---

## Failure mode

If Memorystore Redis is unavailable (network partition, maintenance window):

| Scenario | Behaviour |
|---|---|
| Redis unreachable at startup | `AddStackExchangeRedis` throws — service fails to start. Alert fires. |
| Redis disconnects at runtime | StackExchange.Redis retries with exponential backoff (`abortConnect=false`). SignalR falls back to **in-memory only** during the outage — cross-instance fan-out stops. Messages sent to a group are only delivered to clients on the same instance. |
| Redis reconnects | Backplane resumes automatically. In-flight messages during outage are lost. |

**Risk flag for backend-agent:** Implement a circuit-breaker pattern or at minimum log a warning when `IConnectionMultiplexer.IsConnected == false` so the ops team is aware of degraded mode. Do not silently drop messages.

**Risk flag for team lead:** Memorystore STANDARD_HA provides automatic failover (~60 second RTO). BASIC tier has no replica — Redis downtime = single-instance-only SignalR for the duration. For production, STANDARD_HA is required.

---

## Cost summary

| Tier | Use case | Approx. monthly cost (asia-south1, 1GB) |
|---|---|---|
| BASIC | Staging | ~$50/month |
| STANDARD_HA | Production | ~$280/month |

These figures are approximate (as of 2026). Verify current pricing at [cloud.google.com/memorystore/docs/redis/pricing](https://cloud.google.com/memorystore/docs/redis/pricing).

**Budget flag:** STANDARD_HA adds ~$280/month to the production bill. Requires team lead approval before provisioning production Redis. Run `export REDIS_TIER=STANDARD_HA` before executing `infra/setup.sh` for production.

---

## Related files

- `infra/setup.sh` — Step 6: Memorystore provisioning (BASIC default, STANDARD_HA for prod)
- `infra/cloud-run-services.sh` — ChatService deployment (`--session-affinity`, `min-instances=1`, `memory=1Gi`, `REDIS_CONNECTION_STRING` secret mount)
- `docs/devops/signalr-cloud-run-note.md` — Pre-phase note on Cloud Run WebSocket + sticky sessions
- `docs/devops/observability-slos.md` — Chat service SLO: p95 < 200ms
