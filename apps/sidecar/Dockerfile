# Sidecar Dockerfile
#
# This image is what the Daytona sandbox boots. It includes:
#   - Bun (JavaScript runtime — faster than Node for I/O-heavy workloads)
#   - ripgrep, jq, git, curl, wget (core agent tools)
#   - Python 3.12 + uv (for skills that use Python: charts, pdf, docx, etc.)
#   - tectonic (LaTeX engine, for the pdf skill's academic mode)
#
# The sidecar code itself is bundled via `bun build` and copied in.

FROM oven/bun:1.1-debian AS build

WORKDIR /app
COPY apps/sidecar/package.json apps/sidecar/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY package.json pnpm-workspace.yaml ./

# Install pnpm + deps
RUN bun install -g pnpm
RUN pnpm install --frozen-lockfile

COPY apps/sidecar/ apps/sidecar/
COPY packages/shared-types/ packages/shared-types/

# Build the sidecar bundle
RUN cd apps/sidecar && bun build src/index.ts --target bun --outfile dist/sidecar

# ─── Runtime image ──────────────────────────────────────────────────────────

FROM oven/bun:1.1-debian AS runtime

# Install core agent tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    ripgrep \
    jq \
    git \
    curl \
    wget \
    ca-certificates \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python 3.12 + uv (for skills that use Python)
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && curl -LsSf https://astral.sh/uv/install.sh | sh \
    && ln -s /root/.local/bin/uv /usr/local/bin/uv

# Install tectonic (LaTeX engine, for the pdf skill's academic mode)
RUN curl -LsSf https://drop-sh.fullyjustified.net | sh

# Install Node 24 (for skills that use npm packages: pptxgenjs, mermaid-cli, etc.)
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Copy the built sidecar
COPY --from=build /app/apps/sidecar/dist/sidecar /app/sidecar
COPY --from=build /app/apps/sidecar/node_modules /app/node_modules
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages /app/packages

# Workspace setup
RUN mkdir -p /home/daytona/workspace/download /home/daytona/workspace/upload /home/daytona/workspace/skills
WORKDIR /home/daytona/workspace

ENV AGENTIC_WORKSPACE=/home/daytona/workspace
ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

# Health check — mobile polls this until the sidecar is up.
HEALTHCHECK --interval=10s --timeout=3s --retries=6 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["bun", "/app/sidecar"]
