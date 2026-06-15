# QuestPDF Font Bundling — LoanService and ReportService

**Phase:** 6C (Loan Hub)
**Owner:** devops-engineer (image build instructions) + backend-agent (font loading code)
**Last updated:** 2026-04-25

---

## Why Bundle Fonts in the Docker Image

QuestPDF renders PDFs server-side. When running in a minimal Linux container (the
`mcr.microsoft.com/dotnet/aspnet:10.0-bookworm-slim` runtime image), no system fonts are
present by default. Attempting to load fonts at container startup from a URL introduces:

- A network dependency during startup (startup failure on cold boot if CDN is unavailable).
- Non-deterministic rendering across deployments if upstream font versions change.
- Latency on Cloud Run cold starts.

Fonts must be **embedded in the Docker image at build time** so rendering is hermetic and
offline-capable.

---

## Required Fonts

| Font | Purpose | License | Source |
|------|---------|---------|--------|
| **Inter** | UI / numeric / Latin text in loan documents | SIL OFL 1.1 | https://fonts.google.com/specimen/Inter |
| **Noto Sans Devanagari** | Hindi text in loan documents (Hindi name fields, terms in Hindi) | SIL OFL 1.1 | https://fonts.google.com/noto/specimen/Noto+Sans+Devanagari |
| **Noto Sans Bengali** | Bengali text in loan documents | SIL OFL 1.1 | https://fonts.google.com/noto/specimen/Noto+Sans+Bengali |

All three fonts are under SIL Open Font License 1.1 — free to embed in commercial software.

---

## Font Storage Location in the Repository

Font files live at:

```
backend/Shared/fonts/
  Inter/
    Inter-Regular.ttf
    Inter-Medium.ttf
    Inter-SemiBold.ttf
    Inter-Bold.ttf
  NotoSansDevanagari/
    NotoSansDevanagari-Regular.ttf
    NotoSansDevanagari-Bold.ttf
  NotoSansBengali/
    NotoSansBengali-Regular.ttf
    NotoSansBengali-Bold.ttf
```

**This devops doc references the path. backend-agent owns adding the actual font files.**
Do NOT add font files to this `docs/` directory.

Steps for backend-agent:
1. Download variable-weight `.ttf` files from Google Fonts (linked above).
2. Place them in `backend/Shared/fonts/` using the directory structure above.
3. Add `backend/Shared/fonts/` to `.gitattributes` with `binary` attribute (prevents line-ending mangling).
4. Confirm font files are NOT in `.gitignore`.

---

## Dockerfile Build Instructions

The shared backend Dockerfile is at `backend/Dockerfile` and uses `--build-arg COMPOSITE_NAME=<Name>`.
The fonts are built into the image during the `build` stage and copied to the `runtime` stage.

Add the following to `backend/Dockerfile` (backend-agent owns the file; this is the
expected pattern to implement):

### In the `build` stage — copy fonts into build output

```dockerfile
# Copy shared fonts into published output so they land in the runtime image
COPY backend/Shared/fonts/ /app/publish/fonts/
```

### In the `runtime` stage — copy fonts from build stage

The standard multi-stage pattern copies from the build stage:

```dockerfile
COPY --from=build /app/publish/fonts/ /app/fonts/
```

### QuestPDF font registration (backend-agent implements in C#)

```csharp
// In Program.cs or a Startup extension, before any PDF generation:
QuestPDF.Settings.License = LicenseType.Community;  // or Professional

FontManager.RegisterFontWithCustomName("Inter", File.OpenRead("/app/fonts/Inter/Inter-Regular.ttf"));
FontManager.RegisterFontWithCustomName("Inter", File.OpenRead("/app/fonts/Inter/Inter-Medium.ttf"));
FontManager.RegisterFontWithCustomName("Inter", File.OpenRead("/app/fonts/Inter/Inter-SemiBold.ttf"));
FontManager.RegisterFontWithCustomName("Inter", File.OpenRead("/app/fonts/Inter/Inter-Bold.ttf"));

FontManager.RegisterFontWithCustomName("Noto Sans Devanagari", File.OpenRead("/app/fonts/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf"));
FontManager.RegisterFontWithCustomName("Noto Sans Devanagari", File.OpenRead("/app/fonts/NotoSansDevanagari/NotoSansDevanagari-Bold.ttf"));

FontManager.RegisterFontWithCustomName("Noto Sans Bengali", File.OpenRead("/app/fonts/NotoSansBengali/NotoSansBengali-Regular.ttf"));
FontManager.RegisterFontWithCustomName("Noto Sans Bengali", File.OpenRead("/app/fonts/NotoSansBengali/NotoSansBengali-Bold.ttf"));
```

The path `/app/fonts/` matches the `COPY` destination in the Dockerfile above.

---

## Services that Use These Fonts

| Service | Use case |
|---------|----------|
| **LoanService** | Sanction letter, loan agreement, disbursement advice generation at loan origination |
| **ReportService** | Loan account statement, amortisation schedule, loan summary report |

Both modules live in the **Finance** composite and share `backend/Dockerfile` (built with `COMPOSITE_NAME=Finance`).
The font layer is shared and does not increase per-deploy image size.

---

## Docker Layer Caching

Fonts change infrequently. Place the `COPY backend/Shared/fonts/` instruction **before**
`COPY backend/` source code in the Dockerfile so the font layer is cached independently
of application code changes. This avoids re-downloading ~8MB of font data on every build.

Expected font layer size: ~8–10MB total across all three font families.

---

## Verification

After building the image, verify fonts are present:

```bash
docker run --rm --entrypoint ls \
    asia-south1-docker.pkg.dev/<PROJECT>/services/loan-service:latest \
    /app/fonts/Inter/
# Expected: Inter-Regular.ttf  Inter-Medium.ttf  Inter-SemiBold.ttf  Inter-Bold.ttf
```

In CI (`ci.yml`), add a step to the Docker build validation job:

```yaml
- name: Verify fonts in image
  run: |
    docker run --rm --entrypoint sh $IMAGE -c \
      "ls /app/fonts/Inter/ /app/fonts/NotoSansDevanagari/ /app/fonts/NotoSansBengali/"
```

---

## Local Development

For local `docker-compose` development, fonts are available because the compose file mounts
`./backend` as a volume. However, if running `dotnet run` directly (outside Docker), set:

```bash
# In .env or shell:
QUESTPDF_FONTS_PATH=./backend/Shared/fonts
```

QuestPDF font registration code should fall back to this path when `/app/fonts/` does not exist:

```csharp
var fontsRoot = Environment.GetEnvironmentVariable("QUESTPDF_FONTS_PATH") ?? "/app/fonts";
```
