export function generateStubResponse(prompt: string): string {
  if (prompt.toLowerCase().includes('hello')) {
    return 'Hello there! This is a stubbed response.';
  }
  return `Stub response for: ${prompt}`;
}
