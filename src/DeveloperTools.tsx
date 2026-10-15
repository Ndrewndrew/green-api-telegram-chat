export type DeveloperModeProps = {
  developerMode: boolean;
  onToggleDeveloperMode: () => void;
};

export function DeveloperToggle({
  developerMode,
  onToggleDeveloperMode,
}: DeveloperModeProps) {
  return (
    <button
      type="button"
      className="developer-toggle"
      aria-pressed={developerMode}
      onClick={onToggleDeveloperMode}
    >
      <span aria-hidden="true">{'</>'}</span>
      Режим разработчика
      <span className="toggle-indicator" aria-hidden="true">
        {developerMode ? 'Вкл' : 'Выкл'}
      </span>
    </button>
  );
}

export function DeveloperInfo({
  demo,
  apiUrl,
  instance,
}: {
  demo: boolean;
  apiUrl?: string;
  instance?: string;
}) {
  return (
    <section className="developer-info" aria-label="Технические сведения">
      <h2>Как устроено подключение</h2>
      <p>
        {demo
          ? 'Демо: запросы к GREEN-API не выполняются.'
          : 'Браузер обращается напрямую к Telegram API сервиса GREEN-API.'}
      </p>
      {apiUrl ? (
        <dl>
          <dt>apiUrl</dt>
          <dd>{apiUrl}</dd>
          {instance ? (
            <>
              <dt>idInstance</dt>
              <dd>{instance}</dd>
            </>
          ) : null}
          <dt>apiTokenInstance</dt>
          <dd>Не отображается</dd>
        </dl>
      ) : null}
      <ol>
        <li>
          <span>Проверка подключения</span>
          <code>getStateInstance · getSettings</code>
        </li>
        <li>
          <span>Поиск и отправка</span>
          <code>checkAccount → sendMessage</code>
        </li>
        <li>
          <span>Получение ответа</span>
          <code>receiveNotification → deleteNotification</code>
        </li>
      </ol>
      <small>
        Это схема методов, а не журнал запросов или подтверждение доставки.
      </small>
    </section>
  );
}
