#!/bin/bash
# SnapAccount Claude Code Status Line
# Shows model name and context-usage percentage with a progress bar (single line)

# Read Claude Code JSON input from stdin (if available)
CLAUDE_INPUT=$(cat 2>/dev/null || echo "{}")

# ---------------------------------------------------------------------------
# Model display name
# ---------------------------------------------------------------------------
MODEL_NAME=$(echo "$CLAUDE_INPUT" | jq -r '.model.display_name // ""' 2>/dev/null)
MODEL_ID=$(echo "$CLAUDE_INPUT" | jq -r '.model.id // ""' 2>/dev/null)

# ---------------------------------------------------------------------------
# Context window size: 1M for Opus 1M variants, otherwise 200K
# ---------------------------------------------------------------------------
if echo "$MODEL_ID" | grep -qiE '1m|1-million|1000k'; then
  CTX_SIZE=1000000
else
  CTX_SIZE=200000
fi

# ---------------------------------------------------------------------------
# Compute context usage from transcript (most accurate method)
# ---------------------------------------------------------------------------
CONTEXT_PCT=0
TRANSCRIPT_PATH=$(echo "$CLAUDE_INPUT" | jq -r '.transcript_path // ""' 2>/dev/null)

if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  # Find the most recent assistant message with usage data and sum tokens
  USED_TOKENS=$(python3 - "$TRANSCRIPT_PATH" <<'PYEOF' 2>/dev/null
import sys, json

path = sys.argv[1]
best = None
try:
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except Exception:
                continue
            # Support both top-level and nested message structures
            msg = obj.get('message', obj)
            role = msg.get('role', obj.get('role', ''))
            usage = msg.get('usage')
            if role == 'assistant' and usage and isinstance(usage, dict):
                best = usage
except Exception:
    pass

if best:
    total = (best.get('input_tokens', 0)
             + best.get('cache_read_input_tokens', 0)
             + best.get('cache_creation_input_tokens', 0)
             + best.get('output_tokens', 0))
    print(total)
else:
    print(0)
PYEOF
  )

  USED_TOKENS=${USED_TOKENS:-0}
  # Remove any non-numeric characters
  USED_TOKENS=$(echo "$USED_TOKENS" | tr -cd '0-9')
  USED_TOKENS=${USED_TOKENS:-0}

  if [ "$USED_TOKENS" -gt 0 ] 2>/dev/null; then
    CONTEXT_PCT=$(awk "BEGIN { p = int($USED_TOKENS * 100 / $CTX_SIZE); if (p > 100) p = 100; print p }")
  fi
fi

# ---------------------------------------------------------------------------
# Fallback: use pre-calculated field from JSON if transcript gave nothing
# ---------------------------------------------------------------------------
if [ "$CONTEXT_PCT" -eq 0 ]; then
  USED_PCT_JSON=$(echo "$CLAUDE_INPUT" | jq -r '.context_window.used_percentage // empty' 2>/dev/null)
  if [ -n "$USED_PCT_JSON" ]; then
    CONTEXT_PCT=$(printf "%.0f" "$USED_PCT_JSON" 2>/dev/null || echo "0")
  fi
fi

# Clamp to 0-100
[ "$CONTEXT_PCT" -lt 0 ] 2>/dev/null && CONTEXT_PCT=0
[ "$CONTEXT_PCT" -gt 100 ] 2>/dev/null && CONTEXT_PCT=100

# ---------------------------------------------------------------------------
# Build 10-segment ASCII progress bar
# ---------------------------------------------------------------------------
FILLED=$(( CONTEXT_PCT / 10 ))
EMPTY=$(( 10 - FILLED ))
BAR=""
i=0
while [ $i -lt $FILLED ]; do
  BAR="${BAR}█"
  i=$(( i + 1 ))
done
i=0
while [ $i -lt $EMPTY ]; do
  BAR="${BAR}░"
  i=$(( i + 1 ))
done

# ---------------------------------------------------------------------------
# Single-line output: model name  [████░░░░░░] 38%
# ---------------------------------------------------------------------------
printf "%s  [%s] %d%%\n" "$MODEL_NAME" "$BAR" "$CONTEXT_PCT"
