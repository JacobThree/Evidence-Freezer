import { describe, it, expect } from 'vitest';
import { generateStubResponse } from '../lib/model-client';

describe('Chat Model Client', () => {
  it('returns deterministic stub response', () => {
    const response = generateStubResponse('hello world');
    expect(response).toBe('Hello there! This is a stubbed response.');
    
    const otherResponse = generateStubResponse('what is the meaning of life');
    expect(otherResponse).toBe('Stub response for: what is the meaning of life');
  });
});
