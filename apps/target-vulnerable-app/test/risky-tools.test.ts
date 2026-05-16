import { describe, it, expect } from 'vitest';
import { riskyTools } from '../lib/risky-tools';

describe('Risky Tools', () => {
  it('returns customer record with sensitive data', () => {
    const response = riskyTools.getCustomerRecord('CUST-001');
    expect(response.tool).toBe('getCustomerRecord');
    expect(response.result).toHaveProperty('ssn');
    expect(response.result.ssn).toBe('000-00-0000');
  });

  it('handles unknown customer records', () => {
    const response = riskyTools.getCustomerRecord('UNKNOWN');
    expect(response.result).toHaveProperty('error');
  });

  it('reads internal policy', () => {
    const response = riskyTools.readInternalPolicy('auth');
    expect(response.result.content).toContain('Strictly confidential');
  });
});
