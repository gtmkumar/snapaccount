# SnapAccount Backend — Multi-stage Dockerfile for .NET 10 composite services.
# Usage: docker build --build-arg COMPOSITE_NAME=Platform -t snapaccount/platform-service .
# 3-service modular monolith layout (laundryghar-style 4 layers per composite):
#   Services/PlatformService/Platform.WebApi  (+ Platform.Domain/Application/Infrastructure)
#   Services/FinanceService/Finance.WebApi
#   Services/AssistService/Assist.WebApi

ARG DOTNET_VERSION=10.0
ARG COMPOSITE_NAME=Platform

FROM mcr.microsoft.com/dotnet/sdk:${DOTNET_VERSION} AS build
ARG COMPOSITE_NAME
WORKDIR /src

COPY . .

RUN dotnet restore Services/${COMPOSITE_NAME}Service/${COMPOSITE_NAME}.WebApi/${COMPOSITE_NAME}.WebApi.csproj

RUN dotnet publish Services/${COMPOSITE_NAME}Service/${COMPOSITE_NAME}.WebApi/${COMPOSITE_NAME}.WebApi.csproj \
    --no-restore \
    -c Release \
    -o /app/publish \
    /p:UseAppHost=false \
    /p:PublishTrimmed=false

FROM mcr.microsoft.com/dotnet/aspnet:${DOTNET_VERSION} AS runtime
ARG COMPOSITE_NAME

RUN groupadd --gid 10001 appgroup \
 && useradd  --uid 10001 --gid appgroup --no-create-home --shell /bin/false appuser

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build --chown=appuser:appgroup /app/publish .

ENV ASPNETCORE_URLS=http://+:${PORT:-8080} \
    ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_RUNNING_IN_CONTAINER=true \
    DOTNET_GCConserveMemory=9

USER appuser

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8080}/healthz || exit 1

EXPOSE 8080

ENV COMPOSITE_NAME=${COMPOSITE_NAME}

CMD ["sh", "-c", "dotnet /app/${COMPOSITE_NAME}.WebApi.dll"]
