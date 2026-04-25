# SnapAccount Backend — Multi-stage Dockerfile for .NET 10 microservices
# Usage: docker build --build-arg SERVICE_NAME=AuthService -t snapaccount/auth-service .
# Each microservice is built from the same Dockerfile via SERVICE_NAME build arg.

ARG DOTNET_VERSION=10.0
ARG SERVICE_NAME=AuthService

# ─────────────────────────────────────────────
# Stage 1: restore (cache layer)
# ─────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:${DOTNET_VERSION} AS restore
WORKDIR /src

# Copy solution and all project files first (layer cache friendly)
COPY SnapAccount.sln ./
COPY ServiceDefaults/ServiceDefaults.csproj ServiceDefaults/
COPY src/AuthService/AuthService.csproj src/AuthService/
COPY src/DocumentService/DocumentService.csproj src/DocumentService/
COPY src/AccountingService/AccountingService.csproj src/AccountingService/
COPY src/GstService/GstService.csproj src/GstService/
COPY src/LoanService/LoanService.csproj src/LoanService/
COPY src/ItrService/ItrService.csproj src/ItrService/
COPY src/ChatService/ChatService.csproj src/ChatService/
COPY src/NotificationService/NotificationService.csproj src/NotificationService/
COPY src/ReportService/ReportService.csproj src/ReportService/
COPY src/SubscriptionService/SubscriptionService.csproj src/SubscriptionService/
COPY src/AiService/AiService.csproj src/AiService/

RUN dotnet restore

# ─────────────────────────────────────────────
# Stage 2: build
# ─────────────────────────────────────────────
FROM restore AS build
ARG SERVICE_NAME

COPY . .
RUN dotnet build src/${SERVICE_NAME}/${SERVICE_NAME}.csproj \
    --no-restore \
    -c Release \
    -o /app/build

# ─────────────────────────────────────────────
# Stage 3: publish
# ─────────────────────────────────────────────
FROM build AS publish
ARG SERVICE_NAME

RUN dotnet publish src/${SERVICE_NAME}/${SERVICE_NAME}.csproj \
    --no-restore \
    -c Release \
    -o /app/publish \
    /p:UseAppHost=false \
    /p:PublishTrimmed=false

# ─────────────────────────────────────────────
# Stage 4: runtime (minimal image)
# ─────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:${DOTNET_VERSION} AS runtime

# Security: run as non-root user
RUN groupadd --gid 10001 appgroup \
 && useradd  --uid 10001 --gid appgroup --no-create-home --shell /bin/false appuser

# Install curl for health checks
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy published artefacts and lock down ownership
COPY --from=publish --chown=appuser:appgroup /app/publish .

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

ARG SERVICE_NAME
ENV SERVICE_NAME=${SERVICE_NAME}

ENTRYPOINT ["dotnet", "$(ls /app/*.dll | head -1)"]
# Actual entrypoint resolved at build time via shell form:
CMD ["sh", "-c", "dotnet /app/${SERVICE_NAME}.dll"]
