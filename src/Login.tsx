import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  GreenApi,
  SetupRequiredError,
  suggestApiUrl,
  validateCredentials,
} from './api';
import type { Credentials, ConnectionCheck } from './api';
import { DeveloperInfo, DeveloperToggle } from './DeveloperTools';
import type { DeveloperModeProps } from './DeveloperTools';
import { Icon } from './Icon';
import { ConnectionSetup } from './ConnectionSetup';

export type Session = {
  api: GreenApi | null;
  instance: string;
  apiUrl?: string;
};

export function Login({
  onConnect,
  developerMode,
  onToggleDeveloperMode,
}: { onConnect: (session: Session) => void } & DeveloperModeProps) {
  const [credentials, setCredentials] = useState<
    Pick<Credentials, 'idInstance' | 'apiTokenInstance'>
  >({
    idInstance: '',
    apiTokenInstance: '',
  });
  const [apiUrlOverride, setApiUrlOverride] = useState<string | null>(null);
  const apiUrl = apiUrlOverride ?? suggestApiUrl(credentials.idInstance);
  const [setup, setSetup] = useState<ConnectionCheck | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [serverOpenOverride, setServerOpen] = useState<boolean | null>(null);
  const serverOpen = serverOpenOverride ?? developerMode;
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setSetup(null);
    setBusy(true);
    controller.current = new AbortController();
    let valid: Credentials;
    try {
      valid = validateCredentials({ ...credentials, apiUrl });
    } catch (e) {
      setServerOpen(true);
      setError(
        e instanceof Error ? e.message : 'Проверьте данные подключения.',
      );
      setBusy(false);
      return;
    }
    try {
      const api = new GreenApi(valid);
      await api.connect(controller.current.signal);
      if (!controller.current.signal.aborted)
        onConnect({ api, instance: valid.idInstance, apiUrl: valid.apiUrl });
    } catch (e) {
      if (!controller.current.signal.aborted) {
        if (e instanceof SetupRequiredError) setSetup(e.check);
        else
          setError(e instanceof Error ? e.message : 'Не удалось подключиться.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <header className="login-header">
        <div className="login-brand">
          <span className="brand-icon">
            <Icon name="chat" />
          </span>{' '}
          GREEN-API <span className="divider" /> Telegram
        </div>
        <DeveloperToggle
          developerMode={developerMode}
          onToggleDeveloperMode={() => {
            setServerOpen(null);
            onToggleDeveloperMode();
          }}
        />
      </header>
      <section className="login-card" aria-labelledby="login-title">
        <span className="large-icon">
          <Icon name="send" />
        </span>
        <h1 id="login-title">Подключите Telegram</h1>
        <p className="intro">
          Введите данные Telegram-инстанса
          <br />
          из личного кабинета GREEN-API.
        </p>
        <details className="connection-guide">
          <summary>Где взять данные подключения?</summary>
          <ol>
            <li>Откройте кабинет GREEN-API и создайте инстанс Telegram.</li>
            <li>Подключите к нему Telegram-аккаунт.</li>
            <li>Скопируйте ID и токен из карточки инстанса.</li>
          </ol>
          <a
            href="https://console.green-api.com/"
            target="_blank"
            rel="noreferrer"
          >
            Открыть кабинет GREEN-API ↗
          </a>
          <p>
            Для тестирования используйте отдельный аккаунт: GREEN-API получает
            доступ к его сообщениям.
          </p>
        </details>
        <form onSubmit={connect}>
          <label htmlFor="instance">
            ID инстанса{developerMode ? <code>idInstance</code> : null}
          </label>
          <input
            id="instance"
            name="idInstance"
            inputMode="numeric"
            required
            placeholder="Например, 410000000000"
            value={credentials.idInstance}
            onChange={(e) => {
              setSetup(null);
              setCredentials({ ...credentials, idInstance: e.target.value });
            }}
            autoComplete="off"
            aria-describedby="instance-help"
          />
          <small id="instance-help">Номер вашего подключения в GREEN-API</small>
          <label htmlFor="token">
            Токен доступа{developerMode ? <code>apiTokenInstance</code> : null}
          </label>
          <input
            id="token"
            name="apiTokenInstance"
            type="password"
            required
            placeholder="Вставьте токен из кабинета"
            value={credentials.apiTokenInstance}
            onChange={(e) => {
              setSetup(null);
              setCredentials({
                ...credentials,
                apiTokenInstance: e.target.value,
              });
            }}
            autoComplete="off"
            aria-describedby="token-help"
          />
          <small id="token-help">
            Это токен GREEN-API, а не пароль или код входа в Telegram.
          </small>
          <div className="server-settings">
            <button
              type="button"
              className="settings-disclosure"
              aria-expanded={serverOpen}
              aria-controls="server-settings"
              onClick={() => setServerOpen(!serverOpen)}
            >
              Настройки подключения{' '}
              <span aria-hidden="true">{serverOpen ? '−' : '+'}</span>
            </button>
            {serverOpen ? (
              <div id="server-settings" className="server-settings-fields">
                <label htmlFor="api-url">
                  Адрес сервера{developerMode ? <code>apiUrl</code> : null}
                </label>
                <input
                  id="api-url"
                  name="apiUrl"
                  type="url"
                  required
                  value={apiUrl}
                  onChange={(e) => {
                    setSetup(null);
                    setApiUrlOverride(e.target.value);
                  }}
                  autoComplete="off"
                  aria-describedby="url-help"
                />
                <small id="url-help">
                  Адрес предложен по первым четырём цифрам ID. Сверьте его с
                  apiUrl в карточке инстанса; если он отличается, замените
                  здесь.
                </small>
              </div>
            ) : null}
          </div>
          <p className="form-error" role="alert">
            {error}
          </p>
          <button type="submit" className="primary full" disabled={busy}>
            {busy
              ? 'Проверяем подключение…'
              : setup
                ? 'Проверить снова'
                : 'Подключить Telegram'}
            <Icon name="send" />
          </button>
        </form>
        {setup ? (
          <ConnectionSetup
            check={setup}
            instance={credentials.idInstance.trim()}
            apiUrl={apiUrl}
          />
        ) : null}
        <p className="privacy">
          Токен хранится только в памяти вкладки.
          <br />
          Подключение само по себе не отправляет сообщения.
        </p>
        <div className="or">
          <span>сначала посмотреть интерфейс</span>
        </div>
        <button
          type="button"
          className="secondary full"
          disabled={busy}
          onClick={() => onConnect({ api: null, instance: 'Деморежим' })}
        >
          Посмотреть демо
        </button>
        <p className="demo-help">
          Без ключей и отправки в Telegram.
          <br />
          Ответы в демо генерируются автоматически.
        </p>
        {developerMode ? <DeveloperInfo demo={false} /> : null}
      </section>
      <footer className="login-footer">
        Веб-чат для Telegram через GREEN-API
      </footer>
    </main>
  );
}
