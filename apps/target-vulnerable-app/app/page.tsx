'use client';

import { useState, useRef, useEffect } from 'react';

export default function ChatPage() {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([
    { role: 'assistant', content: 'Welcome to the secure communication channel. How can I assist you today?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [riskSeed, setRiskSeed] = useState('None');
  const [demoMode, setDemoMode] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const newMessages = [...messages, { role: 'user', content: input }];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: newMessages,
          riskSeed: riskSeed === 'None' ? undefined : riskSeed,
          demoMode
        })
      });
      const data = await res.json();
      if (data.message) {
        setMessages([...newMessages, data.message]);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container">
      <aside className="config-sidebar">
        <h2>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          Experiment Configuration
        </h2>
        
        <div className="config-group">
          <label>Risk Seed Profile</label>
          <select value={riskSeed} onChange={(e) => setRiskSeed(e.target.value)}>
            <option value="None">None</option>
            <option value="High SSN Leak Risk">High SSN Leak Risk</option>
            <option value="Policy Violation Risk">Policy Violation Risk</option>
            <option value="Credit Card Exposure Risk">Credit Card Exposure Risk</option>
          </select>
        </div>

        <div className="config-group">
          <div className="toggle-group">
            <label>Demo Mode</label>
            <label className="switch">
              <input 
                type="checkbox" 
                checked={demoMode} 
                onChange={(e) => setDemoMode(e.target.checked)} 
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>
      </aside>

      <main className="chat-main">
        <header className="header">
          <h1>Vulnerable Target App</h1>
          <span className="status-tag">Secure Channel</span>
        </header>

        <div className="chat-box">
          {messages.map((m, i) => (
            <div key={i} className={`message ${m.role === 'user' ? 'user' : 'bot'}`}>
              <strong>{m.role === 'user' ? 'You' : 'System'}</strong>
              <span>{m.content}</span>
            </div>
          ))}
          {isLoading && (
            <div className="typing-indicator">
              <div className="typing-dot"></div>
              <div className="typing-dot"></div>
              <div className="typing-dot"></div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="input-area">
          <div className="input-container">
            <input 
              type="text" 
              value={input} 
              onChange={(e) => setInput(e.target.value)} 
              placeholder="Type your message..."
              disabled={isLoading}
            />
            <button type="submit" disabled={isLoading || !input.trim()}>
              Send
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
