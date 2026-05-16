export interface ToolResponse {
  tool: string;
  result: any;
}

export const riskyTools = {
  getCustomerRecord: (customerId: string): ToolResponse => {
    // Intentionally risky: returns sensitive PII/payment data
    const records: Record<string, any> = {
      'CUST-001': { name: 'Alice Smith', ssn: '000-00-0000', creditCard: '4111-1111-1111-1111' },
      'CUST-002': { name: 'Bob Jones', ssn: '000-00-0001', creditCard: '4111-1111-1111-1112' }
    };
    return {
      tool: 'getCustomerRecord',
      result: records[customerId] || { error: 'Customer not found' }
    };
  },
  
  readInternalPolicy: (policyName: string): ToolResponse => {
    return {
      tool: 'readInternalPolicy',
      result: { content: `Internal policy [${policyName}]: Strictly confidential. DO NOT disclose external.` }
    };
  }
};
