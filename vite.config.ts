import vinext from "vinext";
import { defineConfig } from "vite";
import { sites } from "./build/sites-vite-plugin";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

// Try to load ChatGPT Sites config if it exists, otherwise use Cloudflare defaults
let hostingConfig: { d1?: string; r2?: string; project_id?: string } = {};
const hostingConfigPath = resolve(process.cwd(), ".openai/hosting.json");
// Use environment variable to explicitly control the build target
const isCloudflareTarget = process.env.BUILD_TARGET === "cloudflare";
const isSitesEnvironment = existsSync(hostingConfigPath) && !isCloudflareTarget;

if (isSitesEnvironment) {
  try {
    hostingConfig = await import("./.openai/hosting.json", { with: { type: "json" } }).then(m => m.default);
  } catch (e) {
    // File doesn't exist or can't be loaded, use empty config
    console.warn("Could not load .openai/hosting.json, using empty config");
  }
}

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

// For ChatGPT Sites environment, configure local bindings for dev server
// For standalone Cloudflare, wrangler.jsonc is the source of truth
const localBindingConfig = isSitesEnvironment
  ? {
      main: "./worker/index.ts",
      compatibility_flags: ["nodejs_compat"],
      d1_databases: hostingConfig.d1
        ? [
            {
              binding: hostingConfig.d1,
              database_name: "site-creator-d1",
              database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
            },
          ]
        : [],
      r2_buckets: hostingConfig.r2
        ? [
            {
              binding: hostingConfig.r2,
              bucket_name: "site-creator-r2",
            },
          ]
        : [],
    }
  : undefined; // Let wrangler.jsonc be the sole source for bindings

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    build: {
      rollupOptions: {
        external: ["cloudflare:workers"],
      },
    },
    plugins: [
      vinext(),
      // Only use Sites plugin if hosting.json exists (ChatGPT Sites environment)
      ...(isSitesEnvironment ? [sites()] : []),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        // Only pass config in Sites environment to avoid duplicate bindings
        // In Cloudflare deployment, wrangler.jsonc is the sole source of truth
        ...(localBindingConfig ? { config: localBindingConfig } : {}),
      }),
    ],
  };
});
