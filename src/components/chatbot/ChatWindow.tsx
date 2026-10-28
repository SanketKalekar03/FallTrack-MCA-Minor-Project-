import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Minus, 
  Send, 
  Paperclip, 
  Trash2, 
  Loader2 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatMessage, type ChatMessageData } from './ChatMessage';
import { SuggestedQuestions } from './SuggestedQuestions';
import { RobotIcon } from './RobotIcon';
import { chatbotService } from '../../services/chatbotService';

interface ChatWindowProps {
  isOpen: boolean;
  onClose: () => void;
  profileName?: string;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ isOpen, onClose, profileName }) => {
  const activeUserId = localStorage.getItem('falltrack_active_user_id') || 'guest';
  const chatStorageKey = `falltrack_chat_session_${activeUserId}`;

  const [messages, setMessages] = useState<ChatMessageData[]>(() => {
    const saved = localStorage.getItem(chatStorageKey);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });

  const [logoError, setLogoError] = useState<boolean>(false);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastQuery, setLastQuery] = useState<string | null>(null);

  const latestMessageRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Derive user's first name for personal greeting
  const firstName = profileName && profileName.trim().length > 0 
    ? profileName.trim().split(' ')[0] 
    : 'User';

  // Reload chat session if active user changes
  useEffect(() => {
    const saved = localStorage.getItem(chatStorageKey);
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch {
        setMessages([]);
      }
    } else {
      setMessages([]);
    }
  }, [chatStorageKey]);

  // Smart scroll effect: Stops directly at the bot's answer without skipping to the bottom questions
  useEffect(() => {
    if (!isOpen) return;

    if (loading) {
      setTimeout(() => {
        loadingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    } else if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.sender === 'assistant') {
        setTimeout(() => {
          latestMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 60);
      } else {
        setTimeout(() => {
          latestMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }, 50);
      }
    }

    setTimeout(() => inputRef.current?.focus(), 150);
  }, [isOpen, messages, loading]);

  // Persist messages across local component renders for active user
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(chatStorageKey, JSON.stringify(messages));
    } else {
      localStorage.removeItem(chatStorageKey);
    }
  }, [messages, chatStorageKey]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleClearChat = () => {
    setMessages([]);
    localStorage.removeItem(chatStorageKey);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputValue).trim();
    if (!query || loading) return;

    setLoading(true);
    setInputValue('');
    setLastQuery(query);

    const userMessage: ChatMessageData = {
      id: 'user-' + Date.now(),
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMessage]);

    try {
      const response = await chatbotService.askQuestion(query);

      const botMessage: ChatMessageData = {
        id: 'bot-' + Date.now(),
        sender: 'assistant',
        text: response.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        source: response.source
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (err: any) {
      const errorMessage: ChatMessageData = {
        id: 'error-' + Date.now(),
        sender: 'assistant',
        text: err.message || 'Sorry, I encountered an issue analyzing your records. Please try again.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isError: true
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className="fixed bottom-22 sm:bottom-24 right-4 sm:right-6 w-[calc(100vw-32px)] sm:w-[410px] md:w-[420px] h-[550px] max-h-[80vh] bg-white rounded-3xl shadow-2xl shadow-sky-950/25 border border-slate-100/90 z-50 flex flex-col overflow-hidden font-sans"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-[#007cc2] via-[#0284c7] to-[#0ea5e9] px-4 py-3 sm:py-3.5 text-white flex items-center justify-between shadow-xs select-none shrink-0">
            <div className="flex items-center gap-2.5">
              {/* Circular Mascot Logo Icon */}
              <div className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-xs flex items-center justify-center shrink-0 border border-white/25 shadow-xs p-1 overflow-hidden">
                {!logoError ? (
                  <img
                    src="/chatbot-logo.png?v=2"
                    alt="FallTrack AI"
                    className="w-full h-full object-contain"
                    onError={() => setLogoError(true)}
                  />
                ) : (
                  <RobotIcon size={24} variant="white" />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm sm:text-base tracking-tight text-white leading-tight">
                    FallTrack AI
                  </h3>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Online
                  </span>
                </div>
                <p className="text-[10px] sm:text-[11px] text-white/80 font-normal leading-tight mt-0.5">
                  Production, rates & income assistant
                </p>
              </div>
            </div>

            {/* Header Controls: Clear, Minimize, Close */}
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={handleClearChat}
                  className="p-1.5 text-white/75 hover:text-white hover:bg-white/15 rounded-lg transition-colors cursor-pointer"
                  title="Clear conversation"
                  aria-label="Clear chat"
                >
                  <Trash2 size={15} />
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 text-white/75 hover:text-white hover:bg-white/15 rounded-lg transition-colors cursor-pointer"
                title="Minimize chat"
                aria-label="Minimize chat"
              >
                <Minus size={16} />
              </button>
              <button
                onClick={onClose}
                className="p-1.5 text-white/75 hover:text-white hover:bg-white/15 rounded-lg transition-colors cursor-pointer"
                title="Close chat"
                aria-label="Close chat"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 bg-slate-50/50 space-y-3">
            {messages.length === 0 ? (
              <div className="space-y-3">
                {/* Welcoming Card */}
                <div className="flex items-start gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-sky-50 border border-sky-100 flex items-center justify-center text-[#0284c7] shrink-0 mt-0.5 shadow-2xs p-1 overflow-hidden">
                    {!logoError ? (
                      <img
                        src="/chatbot-logo.png?v=2"
                        alt="FallTrack AI"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <RobotIcon size={20} variant="blue" />
                    )}
                  </div>

                  <div className="flex-1 bg-white border border-slate-100 rounded-2xl p-3 sm:p-3.5 shadow-xs">
                    <h4 className="font-bold text-slate-800 text-xs sm:text-sm">
                      Hi {firstName}! 👋
                    </h4>
                    <p className="font-semibold text-slate-700 text-xs mt-1">
                      I'm FallTrack AI, your smart assistant.
                    </p>
                    <p className="text-xs text-slate-500 leading-relaxed mt-1">
                      I can help you with daily production, falls tracking, color breakdown, rates, and income analytics. How can I help you today?
                    </p>
                  </div>
                </div>

                {/* Suggested Questions */}
                <SuggestedQuestions onSelectQuestion={(q) => handleSendMessage(q)} />
              </div>
            ) : (
              <>
                {messages.map((msg, idx) => {
                  const isLatest = idx === messages.length - 1;
                  return (
                    <div key={msg.id} ref={isLatest ? latestMessageRef : null}>
                      <ChatMessage 
                        message={msg} 
                        onRetry={msg.isError && lastQuery ? () => handleSendMessage(lastQuery) : undefined}
                      />
                    </div>
                  );
                })}

                {/* Loading State */}
                {loading && (
                  <div ref={loadingRef} className="flex items-center gap-2.5 text-slate-400 text-xs py-2 pl-1 animate-pulse">
                    <div className="w-7 h-7 rounded-xl bg-sky-50 border border-sky-100 text-[#0284c7] flex items-center justify-center shadow-2xs">
                      <Loader2 size={13} className="animate-spin" />
                    </div>
                    <span className="font-medium text-slate-500 text-xs">FallTrack AI is thinking...</span>
                  </div>
                )}

                {/* Display suggested questions below the bot's response */}
                {!loading && (
                  <div className="pt-2 pb-1 border-t border-slate-100">
                    <SuggestedQuestions onSelectQuestion={(q) => handleSendMessage(q)} />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer Input */}
          <div className="p-2.5 sm:p-3 bg-white border-t border-slate-100">
            <div className="relative flex items-center bg-white border border-slate-200/90 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500/10 rounded-full px-3 py-1.5 shadow-xs transition-all">
              {/* Paperclip attachment icon */}
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600 transition-colors p-1 cursor-pointer shrink-0"
                title="Attachments are not supported in read-only chat"
                aria-label="Attach file"
                onClick={() => {}}
              >
                <Paperclip size={16} />
              </button>

              {/* Input field */}
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about FallTrack..."
                maxLength={500}
                className="w-full text-xs bg-transparent outline-none text-slate-800 placeholder-slate-400 font-normal px-2"
              />

              {/* Blue Circular Send Button */}
              <button
                onClick={() => handleSendMessage()}
                disabled={!inputValue.trim() || loading}
                className="w-8 h-8 rounded-full bg-[#0284c7] hover:bg-[#0369a1] disabled:bg-slate-200 disabled:text-slate-400 text-white flex items-center justify-center transition-all cursor-pointer disabled:cursor-not-allowed shadow-xs shrink-0"
                aria-label="Send message"
              >
                {loading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} className="translate-x-[-0.5px]" />
                )}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
