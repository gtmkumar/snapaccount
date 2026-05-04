# SnapAccount Backend — Multi-stage Dockerfile for .NET 10 microservices.
# Usage: docker build --build-arg SERVICE_NAME=AuthService -t snapaccount/auth-service .
# Each microservice follows the per-service Clean Architecture layout:
#   Services/<Name>Service/<Name>Service.{Api,Application,Domain,Infrastructure}
# The runtime entrypoint is <Name>Service.Api.dll.

ARG DOTNET_VERSION=10.0
ARG SERVICE_NAME=AuthService

# ─────────────────────────────────────────────
# Stage 1: build + publish
# Copies the whole backend/ tree (no per-csproj enumeration — too brittle
# given 12 services × 4 layers + Shared/AppHost). Layer cache invalidates
# on any backend file change but the matrix runs cache-from gha scope per
# service so re-builds are still fast.
# ─────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:${DOTNET_VERSION} AS build
ARG SERVICE_NAME
WORKDIR /src

COPY . .

RUN dotnet restore Services/${SERVICE_NAME}/${SERVICE_NAME}.Api/${SERVICE_NAME}.Api.csproj

RUN dotnet publish Services/${SERVICE_NAME}/${SERVICE_NAME}.Api/${SERVICE_NAME}.Api.csproj \
    --no-restore \
    -c Release \
    -o /app/publish \
    /p:UseAppHost=false \
    /p:PublishTrimmed=false

# ─────────────────────────────────────────────
# Stage 2: runtime (minimal image)
# ─────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:${DOTNET_VERSION} AS runtime
ARG SERVICE_NAME

# Security: run as non-root user
RUN groupadd --gid 10001 appgroup \
 && useradd  --uid 10001 --gid appgroup --no-create-home --shell /bin/false appuser

# Install curl for health checks
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build --chown=appuser:appgroup /app/publish .

# Cloud Run: listen on PORT env var (default 8080)
ENV ASPNETCORE_URLS=http://+:${PORT:-8080} \
    ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_RUNNING_IN_CONTAINER=true \
    DOTNET_GCConserveMemory=9

USER appuser

# Health check — all services expose /healthz
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8080}/healthz || exit 1

EXPOSE 8080

ENV SERVICE_NAME=${SERVICE_NAME}

# Entrypoint resolved at runtime so the image is parameterised by SERVICE_NAME.
CMD ["sh", "-c", "dotnet /app/${SERVICE_NAME}.Api.dll"]
