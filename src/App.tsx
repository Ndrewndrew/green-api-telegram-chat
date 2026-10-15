import { useEffect, useReducer, useRef, useState } from 'react';
import { delay, pollNotifications } from './api';
import type { Message } from './api';
import { chatReducer, demoState, emptyState } from './chat';
import { Icon } from './Icon';
import { ChatSidebar, MessageList } from './chat-ui';

import { Login } from './Login';
import type { Session } from './Login';
import type { DeveloperModeProps } from './DeveloperTools';
export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [developerMode, setDeveloperMode] = useState(false);
  const modeProps = {
    developerMode,
    onToggleDeveloperMode: () => setDeveloperMode((mode) => !mode),
  };
  return session ? (
    <ChatApp session={session} onExit={() => setSession(null)} {...modeProps} />
  ) : (
    <Login onConnect={setSession} {...modeProps} />
  );
}

function ChatApp({
  session,
  onExit,
  developerMode,
  onToggleDeveloperMode,
}: {
  session: Session;
  onExit: () => void;
} & DeveloperModeProps) {
  const [state, dispatch] = useReducer(
    chatReducer,
    undefined,
    session.api ? () => emptyState : demoState,
  );
  const [pollError, setPollError] = useState('');
  const [sending, setSending] = useState(false);
  const [mobileList, setMobileList] = useState(false);
  const [controller] = useState(() => new AbortController());
  const composer = useRef<HTMLTextAreaElement>(null);
  const demo = !session.api;
  const active = state.chats.find((c) => c.id === state.activeId);
  const messages = state.messages.filter((m) => m.chatId === active?.id);
  const draft = active ? (state.drafts[active.id] ?? '') : '';
  useEffect(() => {
    const abort = controller;
    if (session.api)
      void pollNotifications(
        session.api,
        (event) => dispatch({ type: 'event', event }),
        setPollError,
        abort.signal,
      );
    return () => abort.abort();
  }, [session.api, controller]);
  function selectChat(id: string) {
    dispatch({ type: 'select', id });
    setMobileList(false);
  }
  async function send() {
    if (!active || sending || !draft.trim() || draft.length > 4096) return;
    const text = draft.trim();
    const chatId = active.id;
    const id = crypto.randomUUID();
    const message: Message = {
      id,
      chatId,
      text,
      timestamp: Date.now(),
      direction: 'out',
      status: 'sending',
    };
    dispatch({ type: 'append', message });
    dispatch({ type: 'draft', chatId, text: '' });
    setSending(true);
    try {
      const idMessage = session.api
        ? await session.api.send(chatId, text, controller.signal)
        : id;
      if (controller.signal.aborted) return;
      dispatch({
        type: 'update',
        id,
        patch: { id: idMessage, status: 'queued' },
      });
      if (demo) {
        await delay(700, controller.signal);
        dispatch({ type: 'update', id, patch: { status: 'read' } });
        dispatch({
          type: 'event',
          event: {
            kind: 'message',
            name: active.name,
            message: {
              id: crypto.randomUUID(),
              chatId,
              direction: 'in',
              timestamp: Date.now(),
              text: 'Это автоматический ответ деморежима. Сообщение осталось в этой вкладке и не отправлялось в Telegram.',
            },
          },
        });
      }
    } catch {
      if (!controller.signal.aborted)
        dispatch({ type: 'update', id, patch: { status: 'failed' } });
    } finally {
      setSending(false);
    }
  }

  return (
    <main className={`chat-shell ${mobileList || !active ? 'show-list' : ''}`}>
      <ChatSidebar
        api={session.api}
        instance={session.instance}
        apiUrl={session.apiUrl}
        developerMode={developerMode}
        onToggleDeveloperMode={onToggleDeveloperMode}
        state={state}
        pollError={pollError}
        signal={controller.signal}
        onExit={onExit}
        onSelect={selectChat}
        onAdd={(chat) => {
          dispatch({ type: 'add', chat });
          setMobileList(false);
        }}
      />
      <section className="conversation" aria-label="Переписка">
        <p role="alert" className={`poll-error ${pollError ? 'visible' : ''}`}>
          {pollError}
          {pollError ? ' Переподключитесь, если ошибка сохраняется.' : ''}
        </p>
        {active ? (
          <>
            <header className="conversation-header">
              <button
                className="icon-button mobile-back"
                aria-label="К списку чатов"
                onClick={() => setMobileList(true)}
              >
                <Icon name="back" />
              </button>
              <span className="avatar small-avatar">
                {active.name.replace('@', '').slice(0, 2).toUpperCase()}
              </span>
              <div>
                <h2>{active.name}</h2>
                <p>{active.phone || 'Telegram'}</p>
              </div>
              <span className="channel-badge">Telegram</span>
            </header>
            {demo ? (
              <div className="demo-banner">
                Деморежим. Сообщения не отправляются в Telegram.
                <button onClick={onExit}>Подключить инстанс</button>
              </div>
            ) : null}
            <MessageList
              chat={active}
              messages={messages}
              onRestore={(message) =>
                dispatch({
                  type: 'draft',
                  chatId: message.chatId,
                  text: message.text,
                })
              }
            />
            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <div className="composer-row">
                <textarea
                  ref={composer}
                  aria-label="Текст сообщения"
                  placeholder="Написать сообщение…"
                  rows={1}
                  maxLength={4096}
                  value={draft}
                  onChange={(e) =>
                    dispatch({
                      type: 'draft',
                      chatId: active.id,
                      text: e.target.value,
                    })
                  }
                  onKeyDown={(e) => {
                    if (
                      e.key === 'Enter' &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <button
                  type="submit"
                  className="send-button"
                  aria-label="Отправить сообщение"
                  title="Отправить сообщение"
                  disabled={sending || !draft.trim()}
                >
                  <Icon name="send" />
                </button>
              </div>
              <div className="composer-help">
                <span>Enter — отправить · Shift + Enter — новая строка</span>
                <span>{draft.length} / 4096</span>
              </div>
            </form>
          </>
        ) : (
          <div className="welcome">
            <span className="large-icon">
              <Icon name="chat" />
            </span>
            <h2>Начните разговор</h2>
            <p>
              Создайте чат по номеру телефона
              <br />
              или имени пользователя Telegram.
            </p>
            {demo ? <span className="channel-badge">Деморежим</span> : null}
          </div>
        )}
      </section>
    </main>
  );
}
