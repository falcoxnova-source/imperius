import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AIChatState {
  messages: ChatMessage[];
  isOpen: boolean;
  isLoading: boolean;
  error: string | null;

  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
  sendMessage: (message: string) => Promise<void>;
  clearMessages: () => void;
}

export const useAIChatStore = create<AIChatState>((set, get) => ({
  messages: [],
  isOpen: false,
  isLoading: false,
  error: null,

  openChat: () => set({ isOpen: true }),
  closeChat: () => set({ isOpen: false }),
  toggleChat: () => set((state) => ({ isOpen: !state.isOpen })),

  sendMessage: async (message: string) => {
    const { messages } = get();

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date(),
    };

    set({
      messages: [...messages, userMessage],
      isLoading: true,
      error: null,
    });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const conversationHistory = messages.slice(-20).map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            message,
            conversationHistory,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Error: ${response.status}`);
      }

      const data = await response.json();

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.response,
        timestamp: new Date(data.timestamp),
      };

      set((state) => ({
        messages: [...state.messages, assistantMessage],
        isLoading: false,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get response';
      set({
        isLoading: false,
        error: errorMessage,
      });

      const errorResponse: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Ups, he tenido un problema al procesar tu mensaje. Vuelve a intentarlo en unos segundos, por favor.',
        timestamp: new Date(),
      };

      set((state) => ({
        messages: [...state.messages, errorResponse],
      }));
    }
  },

  clearMessages: () => set({ messages: [], error: null }),
}));
