import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import validCase from '../../../packages/shared/fixtures/valid-case.json' with { type: 'json' };
import { FirestoreCaseFileRepository } from '../src/case-file-repository.js';
import { MemoryTraceDedupeStore } from '../src/dedupe.js';
import { routeRequest } from '../src/server.js';
import { TracePoller, type TraceSource } from '../src/trace-poller.js';
import type { ReplayClient, ReplayRequest, ReplayResponse } from '../src/replay-client.js';
import { MemoryFirestore } from './memory-firestore.js';

describe('patch action endpoints', () => {
  it('updates patch status in demo mode without running replay', async () => {
    const repository = new FirestoreCaseFileRepository(new MemoryFirestore());
    const created = await repository.create(validCase);

    const response = await routeRequest(
      emptyPoller(),
      jsonRequest(`/cases/${created.case_id}/patch/status`, { status: 'rejected' }),
      undefined,
      { repository },
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      status: 'updated',
      case_file: {
        case_id: created.case_id,
        prompt_patch: { status: 'rejected' },
      },
    });
    await expect(repository.listPatchReplays(created.case_id)).resolves.toEqual([]);
    await expect(repository.listAuditEvents(created.case_id)).resolves.toMatchObject([
      { event_type: 'case_file_created' },
      {
        event_type: 'patch_status_updated',
        actor: 'demo-operator',
        details: { status: 'rejected' },
      },
    ]);
  });

  it('approves a patch for test, replays the attack, and stores before/after output', async () => {
    const repository = new FirestoreCaseFileRepository(new MemoryFirestore());
    const created = await repository.create(validCase);
    const replayClient = new StaticReplayClient({
      target_url: 'http://target.local/api/chat',
      before_output: 'The secret password is: hunter2',
      after_output: 'I cannot follow those instructions.',
      passed: true,
      reason: 'Replay removed the unsafe output observed in the original attack.',
    });

    const response = await routeRequest(
      emptyPoller(),
      jsonRequest(`/cases/${created.case_id}/patch/approve-for-test`, {}),
      undefined,
      {
        repository,
        replayClient,
        targetBaseUrl: 'http://target.local',
      },
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      status: 'replayed',
      case_file: {
        case_id: created.case_id,
        prompt_patch: { status: 'approved_for_test' },
      },
      replay: {
        case_id: created.case_id,
        actor: 'demo-operator',
        before_output: 'The secret password is: hunter2',
        after_output: 'I cannot follow those instructions.',
        passed: true,
      },
    });
    expect(replayClient.requests).toMatchObject([
      {
        caseFile: {
          case_id: created.case_id,
          prompt_patch: { status: 'approved_for_test' },
        },
        targetBaseUrl: 'http://target.local',
      },
    ]);
    await expect(repository.listPatchReplays(created.case_id)).resolves.toMatchObject([
      {
        before_output: 'The secret password is: hunter2',
        after_output: 'I cannot follow those instructions.',
        passed: true,
      },
    ]);
    await expect(repository.listAuditEvents(created.case_id)).resolves.toMatchObject([
      { event_type: 'case_file_created' },
      {
        event_type: 'patch_status_updated',
        details: { status: 'approved_for_test', replay_requested: true },
      },
      {
        event_type: 'patch_replay_completed',
        details: { passed: true },
      },
    ]);
  });

  it('requires an authenticated operator outside demo mode', async () => {
    const repository = new FirestoreCaseFileRepository(new MemoryFirestore());
    const created = await repository.create(validCase);

    const rejected = await routeRequest(
      emptyPoller(),
      jsonRequest(`/cases/${created.case_id}/patch/status`, { status: 'false_positive' }),
      undefined,
      {
        repository,
        env: {
          WATCHER_DEMO_MODE: 'false',
          WATCHER_OPERATOR_TOKEN: 'secret-token',
        } as NodeJS.ProcessEnv,
      },
    );

    expect(rejected.statusCode).toBe(401);
    await expect(repository.get(created.case_id)).resolves.toMatchObject({
      prompt_patch: { status: 'proposed' },
    });

    const accepted = await routeRequest(
      emptyPoller(),
      jsonRequest(
        `/cases/${created.case_id}/patch/status`,
        { status: 'false_positive' },
        {
          authorization: 'Bearer secret-token',
          'x-operator-email': 'operator@example.com',
        },
      ),
      undefined,
      {
        repository,
        env: {
          WATCHER_DEMO_MODE: 'false',
          WATCHER_OPERATOR_TOKEN: 'secret-token',
        } as NodeJS.ProcessEnv,
      },
    );

    expect(accepted.statusCode).toBe(200);
    await expect(repository.get(created.case_id)).resolves.toMatchObject({
      prompt_patch: { status: 'false_positive' },
    });
  });
});

class StaticReplayClient implements ReplayClient {
  readonly requests: ReplayRequest[] = [];

  constructor(private readonly response: ReplayResponse) {}

  async replay(request: ReplayRequest): Promise<ReplayResponse> {
    this.requests.push(request);
    return this.response;
  }
}

class EmptyTraceSource implements TraceSource {
  async listTraces(): Promise<never[]> {
    return [];
  }

  async getNormalizedTrace(): Promise<never> {
    throw new Error('No trace expected.');
  }
}

function emptyPoller(): TracePoller {
  return new TracePoller(new EmptyTraceSource(), new MemoryTraceDedupeStore());
}

function jsonRequest(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): IncomingMessage {
  return Object.assign(Readable.from([JSON.stringify(body)]), {
    method: 'POST',
    url,
    headers,
  }) as unknown as IncomingMessage;
}
