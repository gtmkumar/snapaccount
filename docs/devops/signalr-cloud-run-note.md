# SignalR on Cloud Run — Pre-emptive Note for Phase 6F (ChatService)

**Phase:** 6E pre-empt → applies in Phase 6F
**Scope:** ChatService deployment on Cloud Run
**Status:** NOT blocking Phase 6E or 6F. Action required before ChatService goes to production.
**Author:** devops-engineer

---

## Problem

SignalR (used by ChatService for real-time chat and live notifications) requires persistent
WebSocket or long-poll connections between a client and a **specific server instance**.
By default, Cloud Run load-balances requests across all instances with no guarantee of
affinity — meaning a client's WebSocket handshake may land on instance A, while subsequent
messages land on instance B, breaking the connection.

---

## Solution 1 (REQUIRED) — Cloud Run Session Affinity

Enable **session affinity** on the ChatService Cloud Run service. This instructs the GCP
load balancer to route subsequent requests from the same client to the same instance using
a `Set-Cookie` header (`__session_affinity`).

**CLI flag:**
```bash
gcloud run deploy chat-service \
  --session-affinity \
  ... (rest of deploy flags)
```

**Terraform resource attribute (if migrated to Terraform later):**
```hcl
resource "google_cloud_run_v2_service" "chat_service" {
  ...
  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }
  # Session affinity — required for SignalR WebSocket connections
  # See: https://cloud.google.com/run/docs/configuring/session-affinity
  template {
    annotations = {
      "run.googleapis.com/sessionAffinity" = "true"
    }
    ...
  }
}
```

**GCP documentation:** https://cloud.google.com/run/docs/configuring/session-affinity

---

## Solution 2 (REQUIRED for multi-instance scale) — Redis SignalR Backplane

Session affinity alone is not sufficient when ChatService scales beyond 1 instance, because:
- Affinity is best-effort, not guaranteed (instance restarts break it).
- A client reconnecting after a network drop may land on a different instance.
- Messages from backend push (e.g., a new chat message from another user) must be broadcast
  to ALL instances so every connected client receives it.

**Required:** Configure SignalR's Redis backplane via StackExchange.Redis.

The `redis-connection-string-prod` secret already exists in GCP Secret Manager (provisioned
in `infra/setup.sh`, Step 6). ChatService must read this secret and configure:

```csharp
// In ChatService Program.cs (backend-agent responsibility)
builder.Services.AddSignalR()
    .AddStackExchangeRedis(redisConnectionString, options => {
        options.Configuration.ChannelPrefix = RedisChannel.Literal("snapaccount:chat");
    });
```

The Cloud Run service definition for ChatService must pass the Redis secret:
```bash
--set-secrets="ASPNETCORE_REDIS_CONNECTION=redis-connection-string-prod:latest"
```

This is already included in the base `deploy_service` function in `infra/cloud-run-services.sh`
(the `ASPNETCORE_REDIS_CONNECTION` secret is added to all services by default at line 70).
No additional infra change is needed — only the .NET code wiring in ChatService.

---

## Solution 3 (RECOMMENDED at scale) — min-instances=1 for ChatService

WebSocket cold starts have higher user-visible latency than HTTP cold starts. When a user
opens the chat screen, a cold-start can add 2–5s before the WebSocket is established.

For production, set `min-instances=1` on ChatService to eliminate cold starts in the
always-on scenario. This is already configurable in `infra/cloud-run-services.sh` — change
ChatService's `min_instances` argument from `${MIN_DEFAULT}` (which is 0 in staging, 1 in
production) as appropriate.

Current definition in `cloud-run-services.sh` (line 191-198):
```bash
deploy_service \
    "chat-service" \
    "chat-service-sa" \
    "${MIN_DEFAULT}" "${MAX_DEFAULT}" \   # min=1 prod, min=0 staging — already correct
    "" \
    "SERVICE_NAME=ChatService,PUBSUB_TOPIC_PREFIX=snapaccount" \
    "internal-and-cloud-load-balancing" "false" "1" "512Mi"
```

In production (`ENVIRONMENT=production`), `MIN_DEFAULT=1` — so ChatService already has
`min-instances=1` in production. No change needed.

---

## Action items for Phase 6F (backend-agent + devops-engineer)

| # | Action | Owner | When |
|---|---|---|---|
| 1 | Add `--session-affinity` to ChatService Cloud Run deploy in `infra/cloud-run-services.sh` | devops-engineer | Phase 6F start |
| 2 | Wire Redis SignalR backplane in `ChatService/Program.cs` | backend-agent | Phase 6F |
| 3 | Verify `min-instances=1` for ChatService in production (already set via `MIN_DEFAULT`) | devops-engineer | Phase 6F |
| 4 | Integration test: simulate instance restart; verify client reconnects and receives buffered messages | qa-web | Phase 6F |

---

## Why not blocking now

ChatService is not deployed in Phase 6E. Phase 6E delivers NotificationService and
CallbackService. Session affinity and the Redis backplane are only needed when ChatService
is wired to real WebSocket connections (Phase 6F).

This note exists so the Phase 6F devops-engineer dispatch has the full context immediately.

---

## References

- [Cloud Run Session Affinity](https://cloud.google.com/run/docs/configuring/session-affinity)
- [SignalR Redis Backplane](https://learn.microsoft.com/en-us/aspnet/core/signalr/redis-backplane)
- [SignalR with Cloud Run — community notes](https://cloud.google.com/run/docs/tips/general#long_running_requests)
