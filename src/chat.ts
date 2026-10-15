import type { Chat, ChatEvent, Message } from './api';

export type ChatState = {
  chats: Chat[];
  messages: Message[];
  activeId: string | null;
  drafts: Record<string, string>;
};
export const emptyState: ChatState = {
  chats: [],
  messages: [],
  activeId: null,
  drafts: {},
};
export type Action =
  | { type: 'select'; id: string }
  | { type: 'add'; chat: Chat }
  | { type: 'event'; event: ChatEvent }
  | { type: 'append'; message: Message }
  | { type: 'update'; id: string; patch: Partial<Message> }
  | { type: 'draft'; chatId: string; text: string };

export function chatReducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case 'select':
      return {
        ...state,
        activeId: action.id,
        chats: state.chats.map((c) =>
          c.id === action.id ? { ...c, unread: 0 } : c,
        ),
      };
    case 'add':
      return {
        ...state,
        activeId: action.chat.id,
        chats: state.chats.some((c) => c.id === action.chat.id)
          ? state.chats.map((c) =>
              c.id === action.chat.id ? { ...c, unread: 0 } : c,
            )
          : [...state.chats, action.chat],
      };
    case 'draft':
      return {
        ...state,
        drafts: { ...state.drafts, [action.chatId]: action.text },
      };
    case 'append':
      return state.messages.some(
        (m) => m.id === action.message.id && m.chatId === action.message.chatId,
      )
        ? state
        : { ...state, messages: [...state.messages, action.message] };
    case 'update':
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id ? { ...m, ...action.patch } : m,
        ),
      };
    case 'event': {
      const event = action.event;
      if (event.kind === 'status') {
        const rank = {
          sending: 0,
          queued: 1,
          sent: 2,
          delivered: 3,
          read: 4,
          failed: 5,
        };
        return {
          ...state,
          messages: state.messages.map((m) =>
            m.id === event.id &&
            event.status &&
            rank[event.status] > rank[m.status ?? 'queued']
              ? { ...m, status: event.status }
              : m,
          ),
        };
      }
      const message = event.message;
      if (
        state.messages.some(
          (m) => m.id === message.id && m.chatId === message.chatId,
        )
      )
        return state;
      const unread = state.activeId === message.chatId ? 0 : 1;
      const chats = state.chats.some((c) => c.id === message.chatId)
        ? state.chats.map((c) =>
            c.id === message.chatId ? { ...c, unread: c.unread + unread } : c,
          )
        : [...state.chats, { id: message.chatId, name: event.name, unread }];
      return { ...state, chats, messages: [...state.messages, message] };
    }
  }
}

export function demoState(): ChatState {
  const now = Date.now();
  return {
    ...emptyState,
    activeId: 'demo-alex',
    chats: [
      { id: 'demo-alex', name: 'Алексей', phone: '@alex_demo', unread: 0 },
    ],
    messages: [
      {
        id: 'demo-1',
        chatId: 'demo-alex',
        text: 'Привет! Здесь можно проверить, как работает чат.',
        timestamp: now - 120000,
        direction: 'in',
      },
      {
        id: 'demo-2',
        chatId: 'demo-alex',
        text: 'Привет! А сообщения уже отправляются в Telegram?',
        timestamp: now - 90000,
        direction: 'out',
        status: 'read',
      },
      {
        id: 'demo-3',
        chatId: 'demo-alex',
        text: 'Пока это деморежим. Для настоящей переписки подключи свой Telegram-инстанс GREEN-API.',
        timestamp: now - 60000,
        direction: 'in',
      },
    ],
  };
}
