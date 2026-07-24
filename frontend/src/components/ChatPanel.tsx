import React, { useState, useRef, useEffect } from 'react';

interface ChatMessage {
  userId: string;
  userName: string;
  message: string;
  timestamp: number;
  system?: boolean;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (msg: string) => void;
  isCollapsed: boolean;
  onToggle: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  onSend,
  isCollapsed,
  onToggle,
}) => {
  const [input, setInput] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (input.trim()) {
      onSend(input);
      setInput('');
    }
  };

  return (
    <div className={`chat-panel ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="chat-header" onClick={onToggle}>
        <span>Table Chat</span>
        <span>{isCollapsed ? '▼' : '▲'}</span>
      </div>
      {!isCollapsed && (
        <>
          <div className="chat-messages" ref={containerRef}>
            {messages.map((msg, i) => (
              <div key={i} className={msg.system ? 'system' : 'player'}>
                {!msg.system && <div className="avatar-dot" />}
                <div className="bubble">
                  <span className="name">{msg.system ? 'System' : msg.userName}</span>
                  <span className="text">{msg.message}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="chat-input">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type..."
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            <button onClick={handleSend}>Send</button>
          </div>
        </>
      )}
    </div>
  );
};
