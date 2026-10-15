import { useState, useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { GreenApi, parseRecipient } from './api';
import type { Chat, Message } from './api';
import type { ChatState } from './chat';
import { Icon } from './Icon';
import { DeveloperInfo, DeveloperToggle } from './DeveloperTools';
import type { DeveloperModeProps } from './DeveloperTools';

const time = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
const statusNames = {
  sending: 'Отправляется',
  queued: 'В очереди',
  sent: 'Отправлено',
  delivered: 'Доставлено',
  read: 'Прочитано',
  failed: 'Отправка не подтверждена',
};

export function ChatSidebar({
  api,
  instance,
  state,
  pollError,
  signal,
  onExit,
  onSelect,
  onAdd,
  apiUrl,
  developerMode,
  onToggleDeveloperMode,
}: {
  api: GreenApi | null;
  instance: string;
  apiUrl?: string;
  state: ChatState;
  pollError: string;
  signal: AbortSignal;
  onExit: () => void;
  onSelect: (id: string) => void;
  onAdd: (chat: Chat) => void;
} & DeveloperModeProps) {
  const demo = !api;
  const [recipient, setRecipient] = useState('');
  const [query, setQuery] = useState('');
  const [chatError, setChatError] = useState('');
  const [adding, setAdding] = useState(false);
  async function addChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (adding) return;
    setChatError('');
    setAdding(true);
    try {
      let chat: Chat;
      if (api) chat = await api.findChat(recipient, signal);
      else {
        parseRecipient(recipient);
        chat = {
          id: `demo-${recipient.replace(/\W/g, '')}`,
          name: recipient.trim(),
          phone: recipient.trim(),
          unread: 0,
        };
      }
      if (signal.aborted) return;
      onAdd(chat);
      setRecipient('');
    } catch (e) {
      if (!signal.aborted)
        setChatError(
          e instanceof Error ? e.message : 'Не удалось создать чат.',
        );
    } finally {
      setAdding(false);
    }
  }

  const filtered = state.chats.filter((c) =>
    `${c.name} ${c.phone ?? ''}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  return (
    <aside className="sidebar" aria-label="Чаты">
      <header className="sidebar-header">
        <span className="brand-icon">
          <Icon name="chat" />
        </span>
        <div>
          <h1>Сообщения</h1>
          <span>Telegram · GREEN-API</span>
        </div>
        <button
          className="icon-button"
          aria-label="Выйти из чата"
          title="Выйти из чата"
          onClick={onExit}
        >
          <Icon name="exit" />
        </button>
      </header>
      <div className="sidebar-tools">
        <label className="search-field">
          <Icon name="search" />
          <input
            aria-label="Поиск чатов"
            placeholder="Поиск чатов"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <form className="new-chat" onSubmit={addChat}>
          <label htmlFor="recipient">Новый чат</label>
          <div className="recipient-row">
            <input
              id="recipient"
              name="recipient"
              autoComplete="off"
              required
              placeholder="+7 999 123-45-67 или @username"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              aria-describedby="recipient-error"
            />
            <button
              type="submit"
              className="icon-button primary"
              disabled={adding}
              aria-label="Создать чат"
              title="Создать чат"
            >
              <Icon name="plus" />
            </button>
          </div>
          <p id="recipient-error" role="alert" className="form-error">
            {chatError}
          </p>
          {adding ? <small role="status">Ищем получателя…</small> : null}
        </form>
      </div>
      <nav className="chat-list" aria-label="Список чатов">
        {filtered.length ? (
          filtered.map((chat) => {
            const last = state.messages.findLast((m) => m.chatId === chat.id);
            return (
              <button
                key={chat.id}
                className={`chat-item ${state.activeId === chat.id ? 'selected' : ''}`}
                aria-current={state.activeId === chat.id ? 'true' : undefined}
                onClick={() => onSelect(chat.id)}
              >
                <span className="avatar">
                  {chat.name.replace('@', '').slice(0, 2).toUpperCase()}
                </span>
                <span className="chat-item-body">
                  <span className="chat-item-top">
                    <strong>{chat.name}</strong>
                    {last ? <time>{time(last.timestamp)}</time> : null}
                  </span>
                  <span className="chat-preview">
                    {last
                      ? `${last.direction === 'out' ? 'Вы: ' : ''}${last.text}`
                      : 'Начните переписку'}
                  </span>
                </span>
                {chat.unread ? (
                  <span
                    className="unread"
                    aria-label={`${chat.unread} непрочитанных`}
                  >
                    {chat.unread}
                  </span>
                ) : null}
              </button>
            );
          })
        ) : (
          <p className="list-empty">
            {query
              ? 'Чаты не найдены'
              : 'Введите номер получателя, чтобы начать переписку.'}
          </p>
        )}
      </nav>
      <div className="sidebar-devtools">
        <DeveloperToggle
          developerMode={developerMode}
          onToggleDeveloperMode={onToggleDeveloperMode}
        />
        {developerMode ? (
          <DeveloperInfo
            demo={demo}
            apiUrl={apiUrl}
            instance={demo ? undefined : instance}
          />
        ) : null}
      </div>
      <footer className="connection">
        <span className={`connection-dot ${pollError ? 'warning' : ''}`} />
        <div>
          <strong>{demo ? 'Деморежим' : 'Инстанс подключён'}</strong>
          <small>
            {demo
              ? 'Без отправки в Telegram'
              : developerMode
                ? `ID ${instance}`
                : 'Через GREEN-API'}
          </small>
        </div>
      </footer>
    </aside>
  );
}

export function MessageList({
  chat,
  messages,
  onRestore,
}: {
  chat: Chat;
  messages: Message[];
  onRestore: (message: Message) => void;
}) {
  const end = useRef<HTMLDivElement>(null);
  const lastId = messages.at(-1)?.id;
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'instant', block: 'end' });
  }, [lastId, chat.id]);
  return (
    <div
      className="messages"
      role="log"
      aria-label="Сообщения"
      aria-live="polite"
      aria-relevant="additions"
    >
      <div className="message-column">
        {messages.length ? (
          <span className="date-chip">
            {new Date(messages[0].timestamp).toLocaleDateString('ru-RU', {
              day: 'numeric',
              month: 'long',
            })}
          </span>
        ) : (
          <div className="first-message">
            <Icon name="chat" />
            <p>Напишите первое сообщение</p>
            <small>Здесь появятся ваши сообщения и ответы.</small>
          </div>
        )}
        {messages.map((message) => (
          <article
            className={`bubble ${message.direction === 'out' ? 'outgoing' : 'incoming'} ${message.status === 'failed' ? 'failed' : ''}`}
            key={message.id}
            aria-label={message.direction === 'out' ? 'Вы' : chat.name}
          >
            <p>{message.text}</p>
            <div className="message-meta">
              <time dateTime={new Date(message.timestamp).toISOString()}>
                {time(message.timestamp)}
              </time>
              {message.direction === 'out' ? (
                <span
                  title={statusNames[message.status ?? 'queued']}
                  aria-label={statusNames[message.status ?? 'queued']}
                >
                  {message.status === 'failed'
                    ? '!'
                    : message.status === 'sending'
                      ? '◷'
                      : message.status === 'read'
                        ? '✓✓'
                        : '✓'}
                </span>
              ) : null}
            </div>
            {message.status === 'failed' ? (
              <small className="send-error">
                Отправка не подтверждена. Проверьте Telegram перед повтором.
                <button onClick={() => onRestore(message)}>
                  Вернуть текст в поле
                </button>
              </small>
            ) : null}
          </article>
        ))}
        <div ref={end} />
      </div>
    </div>
  );
}
