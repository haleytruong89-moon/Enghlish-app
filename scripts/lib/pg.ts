import type { ClientConfig } from "pg";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);

/**
 * Build a node-postgres config from a DATABASE_URL.
 *
 * - Local hosts (localhost / CI service "postgres"): no TLS.
 * - Remote (Supabase): TLS on. If DATABASE_CA_CERT (PEM text) is set, the server
 *   certificate is verified against it (download the CA from Supabase Dashboard →
 *   Database → SSL). Without it, TLS is used but the certificate is not verified.
 *
 * `sslmode` is stripped from the URL because node-postgres would otherwise override
 * the `ssl` object below.
 */
export function pgConfigFromUrl(databaseUrl: string): ClientConfig {
  const url = new URL(databaseUrl);
  const sslmode = url.searchParams.get("sslmode");
  url.searchParams.delete("sslmode");
  const host = url.hostname.replace(/^\[|\]$/g, "");

  if (sslmode === "disable" || LOCAL_HOSTS.has(host)) {
    return { connectionString: url.toString(), ssl: false };
  }

  const ca = process.env.DATABASE_CA_CERT;
  return {
    connectionString: url.toString(),
    ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
  };
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}
