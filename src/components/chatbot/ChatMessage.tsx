import React, { useState } from 'react';
import { User, Copy, Check, Sparkles } from 'lucide-react';
import { RobotIcon } from './RobotIcon';

export interface ChatMessageData {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  source?: 'ai' | 'deterministic';
  isError?: boolean;
}

interface ChatMessageProps {
  message: ChatMessageData;
  onRetry?: () => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, onRetry }) => {
  const [copied, setCopied] = useState(false);
  const isUser = message.sender === 'user';

  const handleCopy = () => {
    navigator.clipboard.writeText(message.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const cleanLatex = (text: string): string => {
    return text
      .replace(/\$\$/g, '')
      .replace(/\$/g, '')
      .replace(/\\left\(/g, '(')
      .replace(/\\right\)/g, ')')
      .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1 ÷ $2)')
      .replace(/\\text\{([^}]+)\}/g, '$1')
      .replace(/\\times/g, '×')
      .replace(/\\div/g, '÷')
      .replace(/\\quad/g, ' ')
      .replace(/\(\(([^()]+)\)\)/g, '($1)')
      .trim();
  };

  // Basic formatting helper for markdown bold, bullet points, and formulas
  const renderFormattedText = (text: string) => {
    const lines = text.split('\n');
    return (
      <div className="space-y-1.5 text-xs leading-relaxed">
        {lines.map((line, idx) => {
          const trimmed = line.trim();
          if (!trimmed) {
            return <div key={idx} className="h-1" />;
          }

          // Headers
          if (trimmed.startsWith('### ')) {
            return (
              <h4 key={idx} className="font-bold text-sm text-slate-800 mt-2 mb-1 flex items-center gap-1.5">
                {trimmed.replace('### ', '')}
              </h4>
            );
          }

          // Math Formulas (LaTeX or explicit formula blocks)
          if (
            trimmed.includes('$$') || 
            trimmed.includes('\\text{') || 
            trimmed.includes('\\frac{') ||
            (trimmed.startsWith('`') && trimmed.endsWith('`') && trimmed.includes('='))
          ) {
            const formulaContent = trimmed.startsWith('`') && trimmed.endsWith('`')
              ? trimmed.slice(1, -1)
              : cleanLatex(trimmed);
            return (
              <div
                key={idx}
                className="my-2 px-3 py-2 bg-sky-50/80 border border-sky-200/80 rounded-xl text-center shadow-2xs font-mono font-bold text-[#0284c7] text-xs tracking-wide"
              >
                {formulaContent}
              </div>
            );
          }

          // Bullet points
          if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
            const content = trimmed.substring(2);
            return (
              <div key={idx} className="flex items-start gap-1.5 pl-1 text-slate-700">
                <span className="text-[#0284c7] font-black">•</span>
                <span>{renderInlineFormatting(content)}</span>
              </div>
            );
          }

          return (
            <p key={idx} className={isUser ? 'text-white' : 'text-slate-700'}>
              {renderInlineFormatting(trimmed)}
            </p>
          );
        })}
      </div>
    );
  };

  const renderInlineFormatting = (text: string) => {
    // Replace **bold**
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-bold text-slate-900">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={i} className="italic text-slate-600">{part.slice(1, -1)}</em>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={i} className="px-1 py-0.5 bg-slate-100 rounded text-[11px] font-mono text-[#0284c7]">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  return (
    <div className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'} group mb-3`}>
      {/* Bot Avatar */}
      {!isUser && (
        <div className="w-7 h-7 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-[#0284c7] shrink-0 shadow-2xs mt-0.5">
          <RobotIcon size={16} variant="blue" />
        </div>
      )}

      {/* Message Card */}
      <div className={`max-w-[85%] sm:max-w-[78%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`p-3 rounded-2xl text-xs relative transition-all duration-200 ${
            isUser
              ? 'bg-[#0284c7] text-white rounded-br-xs shadow-md shadow-sky-500/10'
              : message.isError
              ? 'bg-rose-50 border border-rose-200 text-rose-800 rounded-bl-xs'
              : 'bg-white border border-slate-200/80 text-slate-800 rounded-bl-xs shadow-sm hover:border-slate-300'
          }`}
        >
          {/* Source indicator pill for assistant */}
          {!isUser && message.source && (
            <div className="flex items-center gap-1 mb-1.5">
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                message.source === 'ai' 
                  ? 'bg-sky-50 text-[#0284c7] border border-sky-100' 
                  : message.text.startsWith('⚠️')
                  ? 'bg-amber-50 text-amber-800 border border-amber-200/70'
                  : 'bg-slate-100 text-slate-600 border border-slate-200/60'
              }`}>
                {message.source === 'ai' ? (
                  <>
                    <Sparkles size={10} className="text-[#0284c7]" /> FallTrack AI Verified
                  </>
                ) : message.text.startsWith('⚠️') ? (
                  <>FallTrack Notice</>
                ) : (
                  <>FallTrack Calculation</>
                )}
              </span>
            </div>
          )}

          {/* Message Content */}
          {renderFormattedText(message.text)}

          {/* Retry Button on Error */}
          {message.isError && onRetry && (
            <button
              onClick={onRetry}
              className="mt-2 text-xs font-bold text-rose-700 underline hover:text-rose-900 cursor-pointer"
            >
              Retry question
            </button>
          )}

          {/* Copy Button */}
          {!isUser && !message.isError && (
            <div className="flex items-center justify-end mt-1.5 pt-1 border-t border-slate-100">
              <button
                onClick={handleCopy}
                className="opacity-40 group-hover:opacity-100 transition-opacity p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 cursor-pointer flex items-center gap-1 text-[10px]"
                title="Copy text"
              >
                {copied ? (
                  <>
                    <Check size={11} className="text-emerald-600" />
                    <span className="text-emerald-600 font-bold">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy size={11} />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Timestamp */}
        <span className="text-[9px] text-slate-400 mt-1 px-1">
          {message.timestamp}
        </span>
      </div>

      {/* User Avatar */}
      {isUser && (
        <div className="w-7 h-7 rounded-xl bg-slate-200 flex items-center justify-center text-slate-600 shrink-0 mt-0.5 shadow-2xs">
          <User size={14} />
        </div>
      )}
    </div>
  );
};
