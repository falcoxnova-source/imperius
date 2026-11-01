import { useState, useRef, useEffect } from 'react';
import { X, Send, Sparkles, Trash2, Minimize2, Maximize2 } from 'lucide-react';
import { useAIChatStore } from '../../store/aiChatStore';
import { useI18n } from '../../lib/i18n';

const AI_AVATAR_URL = '/Imagenes/bot%20agente%20ai/logo%20bot%20ia.webp';

function formatMessage(content: string): JSX.Element {
  const parts = content.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`|\n)/g);

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={index}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) {
          return <em key={index}>{part.slice(1, -1)}</em>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={index} className="bg-space-700/50 px-1.5 py-0.5 rounded text-cyan-300 text-sm">
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part === '\n') {
          return <br key={index} />;
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

export function AIAssistant() {
  const { messages, isOpen, isLoading, sendMessage, toggleChat, closeChat, clearMessages } = useAIChatStore();
  const [input, setInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isInsideChat = chatContainerRef.current?.contains(target);
      const isToggleButton = toggleButtonRef.current?.contains(target);

      if (!isInsideChat && !isToggleButton) {
        closeChat();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, closeChat]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const message = input.trim();
    setInput('');
    await sendMessage(message);
  };

  const suggestedQuestions = [
    { text: t.aiAssistant.analyzeAccount, icon: '🔍', highlight: true },
    { text: t.aiAssistant.whatToBuild, icon: '🏗️', highlight: false },
    { text: t.aiAssistant.fleetStrategy, icon: '🚀', highlight: false },
    { text: t.aiAssistant.researchPriority, icon: '🔬', highlight: false },
  ];

  return (
    <>
      <button
        ref={toggleButtonRef}
        onClick={toggleChat}
        className={`fixed bottom-20 sm:bottom-4 right-4 z-50 w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg overflow-hidden ${
          isOpen
            ? 'bg-space-700 hover:bg-space-600'
            : 'p-0 hover:scale-105'
        }`}
        aria-label={isOpen ? t.aiAssistant.closeAssistant : t.aiAssistant.openAssistant}
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <div className="relative w-full h-full">
            <img src={AI_AVATAR_URL} alt="NOVA" className="w-full h-full object-cover" />
            <Sparkles className="w-3 h-3 text-yellow-300 absolute top-0 right-0 animate-pulse" />
          </div>
        )}
      </button>

      <div
        ref={chatContainerRef}
        className={`fixed z-40 transition-all duration-300 ease-out ${
          isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        } ${
          isExpanded
            ? 'bottom-4 right-4 left-4 top-4 sm:left-auto sm:top-4 sm:w-[500px] sm:h-auto'
            : 'bottom-36 sm:bottom-20 right-4 w-[380px] max-w-[calc(100vw-2rem)]'
        }`}
      >
        <div
          className={`bg-space-800/95 backdrop-blur-xl border border-space-600/50 rounded-2xl shadow-2xl flex flex-col overflow-hidden ${
            isExpanded ? 'h-full sm:h-[calc(100vh-2rem)]' : 'h-[500px] max-h-[calc(100dvh-10rem)] sm:max-h-none'
          }`}
        >
          <div className="bg-gradient-to-r from-space-700 via-space-700/90 to-space-700 px-4 py-3 flex items-center justify-between border-b border-space-600/50">
            <div className="flex items-center gap-3">
              <div className="relative">
                <img src={AI_AVATAR_URL} alt="NOVA" className="w-10 h-10 rounded-full object-cover" />
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-space-700" />
              </div>
              <div>
                <h3 className="font-semibold text-white text-sm">{t.aiAssistant.title}</h3>
                <p className="text-xs text-space-300">{t.aiAssistant.subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={clearMessages}
                  className="p-2 text-space-400 hover:text-red-400 hover:bg-space-600/50 rounded-lg transition-colors"
                  title={t.aiAssistant.clearConversation}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-2 text-space-400 hover:text-white hover:bg-space-600/50 rounded-lg transition-colors"
                title={isExpanded ? t.aiAssistant.minimize : t.aiAssistant.expand}
              >
                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-space-600 scrollbar-track-transparent">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <div className="relative mb-4">
                  <img src={AI_AVATAR_URL} alt="NOVA" className="w-16 h-16 rounded-full object-cover" />
                  <Sparkles className="w-4 h-4 text-yellow-300 absolute -top-1 -right-1 animate-pulse" />
                </div>
                <h4 className="text-white font-medium mb-2">{t.aiAssistant.welcome}</h4>
                <p className="text-space-300 text-sm mb-6">
                  {t.aiAssistant.welcomeDescription}
                </p>
                <div className="space-y-2 w-full">
                  {suggestedQuestions.map((q) => (
                    <button
                      key={q.text}
                      onClick={() => {
                        setInput(q.text);
                        inputRef.current?.focus();
                      }}
                      className={`w-full px-3 py-2.5 text-sm text-left rounded-lg transition-all flex items-center gap-2 ${
                        q.highlight
                          ? 'bg-gradient-to-r from-cyan-600/20 to-blue-600/20 border border-cyan-500/40 hover:border-cyan-400/60 text-cyan-200 hover:text-white'
                          : 'bg-space-700/50 hover:bg-space-600/50 border border-space-600/30 hover:border-space-500/50 text-space-200 hover:text-white'
                      }`}
                    >
                      <span className="text-base">{q.icon}</span>
                      <span>{q.text}</span>
                      {q.highlight && (
                        <span className="ml-auto text-[10px] uppercase tracking-wider text-cyan-400 font-medium">{t.aiAssistant.personalized}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                      message.role === 'user'
                        ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-br-sm'
                        : 'bg-space-700/80 text-space-100 rounded-bl-sm border border-space-600/30'
                    }`}
                  >
                    <div className="text-sm leading-relaxed whitespace-pre-wrap">
                      {message.role === 'assistant' ? formatMessage(message.content) : message.content}
                    </div>
                    <div
                      className={`text-[10px] mt-1 ${
                        message.role === 'user' ? 'text-cyan-200/60' : 'text-space-400'
                      }`}
                    >
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-space-700/80 rounded-2xl rounded-bl-sm px-4 py-3 border border-space-600/30">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-xs text-space-400">{t.aiAssistant.thinking}</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form
            onSubmit={handleSubmit}
            className="p-3 border-t border-space-600/50 bg-space-800/50"
          >
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t.aiAssistant.placeholder}
                disabled={isLoading}
                className="flex-1 bg-space-700/50 border border-space-600/50 rounded-xl px-4 py-2.5 text-sm text-white placeholder-space-400 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 disabled:opacity-50 transition-all"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="w-10 h-10 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 disabled:from-space-600 disabled:to-space-600 disabled:cursor-not-allowed flex items-center justify-center transition-all shadow-lg shadow-cyan-500/20 disabled:shadow-none"
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
