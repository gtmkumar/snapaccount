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

# Bundle QuestPDF fonts for Finance composite (Report + Loan PDF generation).
# Fonts are fetched at image build time — not stored in git (SIL OFL 1.1).
RUN if [ "${COMPOSITE_NAME}" = "Finance" ]; then \
      apt-get update && apt-get install -y --no-install-recommends curl unzip ca-certificates && \
      mkdir -p /app/publish/fonts/Inter /app/publish/fonts/NotoSansDevanagari /app/publish/fonts/NotoSansBengali && \
      curl -fsSL -o /tmp/inter.zip https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip && \
      unzip -q /tmp/inter.zip extras/ttf/Inter-Regular.ttf extras/ttf/Inter-Medium.ttf extras/ttf/Inter-SemiBold.ttf extras/ttf/Inter-Bold.ttf -d /tmp/inter && \
      cp /tmp/inter/extras/ttf/Inter-*.ttf /app/publish/fonts/Inter/ && \
      curl -fsSL -o /app/publish/fonts/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf \
        "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansdevanagari/NotoSansDevanagari%5Bwdth,wght%5D.ttf" && \
      cp /app/publish/fonts/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf \
        /app/publish/fonts/NotoSansDevanagari/NotoSansDevanagari-Bold.ttf && \
      curl -fsSL -o /app/publish/fonts/NotoSansBengali/NotoSansBengali-Regular.ttf \
        "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansbengali/NotoSansBengali%5Bwdth,wght%5D.ttf" && \
      cp /app/publish/fonts/NotoSansBengali/NotoSansBengali-Regular.ttf \
        /app/publish/fonts/NotoSansBengali/NotoSansBengali-Bold.ttf && \
      rm -rf /tmp/inter.zip /tmp/inter && \
      apt-get purge -y unzip && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*; \
    fi

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
