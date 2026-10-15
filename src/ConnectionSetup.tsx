import type { ConnectionCheck } from './api';

export function ConnectionSetup({
  check,
  instance,
  apiUrl,
}: {
  check: ConnectionCheck;
  instance: string;
  apiUrl: string;
}) {
  const unauthorized = check.stateInstance === 'notAuthorized';
  const authorized = check.stateInstance === 'authorized';
  return (
    <section
      className="connection-setup"
      role="status"
      aria-label="Готовность подключения"
    >
      <h2>
        {unauthorized
          ? 'Осталось подключить Telegram'
          : authorized
            ? 'Проверьте настройки уведомлений'
            : 'Telegram ещё не готов'}
      </h2>
      <ul>
        <li className="ready">
          <span aria-hidden="true">✓</span> Доступ к GREEN-API подтверждён
        </li>
        <li className={check.incomingEnabled ? 'ready' : 'pending'}>
          <span aria-hidden="true">{check.incomingEnabled ? '✓' : '•'}</span>{' '}
          {check.incomingEnabled
            ? 'Входящие сообщения включены'
            : 'Включите уведомления о входящих сообщениях'}
        </li>
        <li className={check.webhookEmpty ? 'ready' : 'pending'}>
          <span aria-hidden="true">{check.webhookEmpty ? '✓' : '•'}</span>{' '}
          {check.webhookEmpty
            ? 'Получение через очередь настроено'
            : 'Очистите адрес отправки уведомлений (webhook URL)'}
        </li>
        <li className={check.statusesEnabled ? 'ready' : 'pending'}>
          <span aria-hidden="true">{check.statusesEnabled ? '✓' : '•'}</span>{' '}
          {check.statusesEnabled
            ? 'Статусы отправки включены'
            : 'Статусы отправки выключены (необязательно)'}
        </li>
      </ul>
      {unauthorized ? (
        <p>
          В карточке инстанса нажмите «Получить QR». На телефоне откройте
          Telegram → Настройки → Устройства → Подключить устройство. После входа
          нажмите «Проверить снова» здесь.
        </p>
      ) : !authorized ? (
        <p>
          Состояние инстанса: <code>{check.stateInstance}</code>. Дождитесь его
          готовности и проверьте подключение снова.
        </p>
      ) : (
        <p>
          Измените отмеченные настройки в кабинете. Применение изменений может
          занять до 5 минут. Затем нажмите «Проверить снова».
        </p>
      )}
      <a
        href={`https://console.green-api.com/instanceList/${instance}`}
        target="_blank"
        rel="noreferrer"
      >
        Открыть карточку инстанса ↗
      </a>
      <small>Проверен сервер {apiUrl}. Сообщения ещё не отправлялись.</small>
    </section>
  );
}
