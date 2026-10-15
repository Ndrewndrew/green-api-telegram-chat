import { useEffect, useReducer, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { delay, GreenApi, pollNotifications, validateCredentials } from './api';
import type { Credentials, Message } from './api';
import { chatReducer, demoState, emptyState } from './chat';
import { Icon } from './Icon';
import { ChatSidebar, MessageList } from './chat-ui';

type Session = { api: GreenApi | null; instance: string };
export function App() {
  const [session, setSession] = useState<Session | null>(null);
  return session ? (
    <ChatApp session={session} onExit={() => setSession(null)} />
  ) : (
    <Login onConnect={setSession} />
  );
}

function Login({ onConnect }: { onConnect: (session: Session) => void }) {
  const [credentials, setCredentials] = useState<Credentials>({
    apiUrl: 'https://api.green-api.com',
    idInstance: '',
    apiTokenInstance: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    controller.current = new AbortController();
    try {
      const valid = validateCredentials(credentials);
      const api = new GreenApi(valid);
      await api.connect(controller.current.signal);
      if (!controller.current.signal.aborted)
        onConnect({ api, instance: valid.idInstance });
    } catch (e) {
      if (!controller.current.signal.aborted)
        setError(e instanceof Error ? e.message : 'Не удалось подключиться.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-brand">
        <span className="brand-icon">
          <Icon name="chat" />
        </span>{' '}
        GREEN-API <span className="divider" /> Telegram
      </div>
      <section className="login-card" aria-labelledby="login-title">
        <span className="large-icon">
          <Icon name="send" />
        </span>
        <h1 id="login-title">
          Ваш Telegram.
          <br />В простом веб-чате.
        </h1>
        <p className="intro">
          Подключите инстанс GREEN-API,
          <br />
          чтобы отправлять сообщения и получать ответы.
        </p>
        <form onSubmit={connect}>
          <label htmlFor="api-url">apiUrl</label>
          <input
            id="api-url"
            name="apiUrl"
            type="url"
            required
            value={credentials.apiUrl}
            onChange={(e) =>
              setCredentials({ ...credentials, apiUrl: e.target.value })
            }
            aria-describedby="url-help"
            autoComplete="off"
          />
          <small id="url-help">Адрес API из личного кабинета GREEN-API</small>
          <label htmlFor="instance">idInstance</label>
          <input
            id="instance"
            name="idInstance"
            inputMode="numeric"
            required
            placeholder="Например, 4100000000"
            value={credentials.idInstance}
            onChange={(e) =>
              setCredentials({ ...credentials, idInstance: e.target.value })
            }
            autoComplete="off"
          />
          <label htmlFor="token">apiTokenInstance</label>
          <input
            id="token"
            name="apiTokenInstance"
            type="password"
            required
            placeholder="Токен вашего инстанса"
            value={credentials.apiTokenInstance}
            onChange={(e) =>
              setCredentials({
                ...credentials,
                apiTokenInstance: e.target.value,
              })
            }
            autoComplete="off"
          />
          <p className="form-error" role="alert">
            {error}
          </p>
          <button type="submit" className="primary full" disabled={busy}>
            {busy ? 'Проверяем подключение…' : 'Подключить Telegram'}
            <Icon name="send" />
          </button>
        </form>
        <div className="or">
          <span>или без ключей</span>
        </div>
        <button
          className="secondary full"
          disabled={busy}
          onClick={() => onConnect({ api: null, instance: 'Деморежим' })}
        >
          Посмотреть демо
        </button>
        <p className="privacy">
          Токен хранится только в памяти этой вкладки.
          <br />
          Обновление страницы завершит сеанс.
        </p>
      </section>
      <footer className="login-footer">React · TypeScript · GREEN-API</footer>
    </main>
  );
}

function ChatApp({
  session,
  onExit,
}: {
  session: Session;
  onExit: () => void;
}) {
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
