import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';

const ConfigSchema = z.object({
  PHOENIX_HOST: z.string().url().optional(),
  PHOENIX_BASE_URL: z.string().url().optional(),
  PHOENIX_API_KEY: z.string().min(1).optional(),
  PHOENIX_PROJECT: z.string().min(1).optional(),
  PHOENIX_PROJECT_NAME: z.string().min(1).optional(),
  PHOENIX_CLIENT_HEADERS: z.string().optional(),
});

export type OfficialPhoenixMcpConfig = {
  baseUrl: string;
  apiKey?: string;
  project?: string;
};

export type OfficialPhoenixMcpClient = {
  listTools(): Promise<unknown>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
};

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): OfficialPhoenixMcpConfig {
  const parsed = ConfigSchema.parse(env);
  const baseUrl = parsed.PHOENIX_HOST ?? parsed.PHOENIX_BASE_URL;
  if (!baseUrl) {
    throw new Error('PHOENIX_HOST or PHOENIX_BASE_URL is required.');
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    apiKey: parsed.PHOENIX_API_KEY,
    project: parsed.PHOENIX_PROJECT ?? parsed.PHOENIX_PROJECT_NAME,
  };
}

export class StdioOfficialPhoenixMcpClient implements OfficialPhoenixMcpClient {
  readonly #config: OfficialPhoenixMcpConfig;
  #client?: Client;
  #connecting?: Promise<Client>;

  constructor(config: OfficialPhoenixMcpConfig = configFromEnv()) {
    this.#config = config;
  }

  async listTools(): Promise<unknown> {
    const client = await this.#connect();
    return client.listTools();
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const client = await this.#connect();
    return client.callTool({ name, arguments: mapCompatibilityArguments(name, args) });
  }

  async close(): Promise<void> {
    await this.#client?.close();
    this.#client = undefined;
    this.#connecting = undefined;
  }

  async #connect(): Promise<Client> {
    if (this.#client) {
      return this.#client;
    }

    this.#connecting ??= this.#createClient();
    this.#client = await this.#connecting;
    return this.#client;
  }

  async #createClient(): Promise<Client> {
    const entrypoint = officialPackageEntrypoint();
    const args = [entrypoint, '--baseUrl', this.#config.baseUrl];
    if (this.#config.apiKey) {
      args.push('--apiKey', this.#config.apiKey);
    }
    if (this.#config.project) {
      args.push('--project', this.#config.project);
    }

    const transport = new StdioClientTransport({
      command: process.execPath,
      args,
      env: {
        ...process.env,
        PHOENIX_HOST: this.#config.baseUrl,
        ...(this.#config.apiKey ? { PHOENIX_API_KEY: this.#config.apiKey } : {}),
        ...(this.#config.project ? { PHOENIX_PROJECT: this.#config.project } : {}),
      },
    });
    const client = new Client({ name: 'evidence-freezer-cloudrun-wrapper', version: '0.0.0' });
    await client.connect(transport);
    return client;
  }
}

export function officialPackageEntrypoint(): string {
  const require = createRequire(import.meta.url);
  const packageJsonPath = require.resolve('@arizeai/phoenix-mcp/package.json');
  return join(dirname(packageJsonPath), 'build', 'index.js');
}

export function mapCompatibilityArguments(name: string, args: Record<string, unknown>): Record<string, unknown> {
  if (name === 'list-traces') {
    return stripUndefined({
      project_identifier: args.project_identifier ?? args.projectName,
      limit: args.limit,
      since: args.since,
      last_n_minutes: args.last_n_minutes ?? args.lastNMinutes,
      include_annotations: args.include_annotations ?? args.includeAnnotations,
    });
  }

  if (name === 'get-trace') {
    return stripUndefined({
      project_identifier: args.project_identifier ?? args.projectName,
      trace_id: args.trace_id ?? args.traceId,
      include_annotations: args.include_annotations ?? args.includeAnnotations,
    });
  }

  if (name === 'get-spans') {
    return stripUndefined({
      project_identifier: args.project_identifier ?? args.projectName,
      trace_ids: args.trace_ids ?? (typeof args.traceId === 'string' ? [args.traceId] : undefined),
      limit: args.limit,
      include_annotations: args.include_annotations ?? args.includeAnnotations,
    });
  }

  return args;
}

function stripUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

export function officialPackageVersion(): string | undefined {
  const result = spawnSync(process.execPath, [officialPackageEntrypoint(), '--version'], {
    env: { ...process.env, PHOENIX_HOST: 'http://localhost:6006' },
    timeout: 1000,
    encoding: 'utf8',
  });
  return result.stdout.trim() || undefined;
}
