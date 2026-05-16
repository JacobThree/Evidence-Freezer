import { NextRequest, NextResponse } from 'next/server';
import { generateStubResponse } from '../../../lib/model-client';

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    const lastUserMessage = messages[messages.length - 1];
    
    const responseContent = generateStubResponse(lastUserMessage.content);
    
    return NextResponse.json({ 
      message: { role: 'assistant', content: responseContent } 
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
