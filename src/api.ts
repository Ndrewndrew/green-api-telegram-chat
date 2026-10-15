export type Credentials = {
  apiUrl: string;
  idInstance: string;
  apiTokenInstance: string;
};
export type Message = {
  id: string;
  chatId: string;
  text: string;
  timestamp: number;
  direction: 'in' | 'out';
  status?: 'sending' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
};
export type Chat = { id: string; name: string; phone?: string; unread: number };
export type Notification = { receiptId: number; body: Record<string, unknown> };
export type ChatEvent =
  | { kind: 'message'; message: Message; name: string }
  | { kind: 'status'; id: string; status: Message['status'] };

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status = 0,
  ) {
    super(message);
  }
}

export function validateCredentials(input: Credentials): Credentials {
  const apiUrl = new URL(input.apiUrl.trim());
  if (
    apiUrl.protocol !== 'https:' ||
    !/^(?:[a-z0-9-]+\.)?api\.green-api\.com$/.test(apiUrl.hostname) ||
    apiUrl.port ||
    apiUrl.username ||
    apiUrl.password ||
    apiUrl.search ||
    apiUrl.hash ||
    apiUrl.pathname !== '/'
  ) {
    throw new Error(
      'Укажите HTTPS-адрес API из кабинета GREEN-API, например https://4100.api.green-api.com.',
    );
  }
  if (
    !/^\d+$/.test(input.idInstance.trim()) ||
    !/^[a-zA-Z0-9_-]+$/.test(input.apiTokenInstance.trim())
  ) {
    throw new Error(
      'Проверьте idInstance и apiTokenInstance из кабинета GREEN-API.',
    );
  }
  return {
    apiUrl: apiUrl.origin,
    idInstance: input.idInstance.trim(),
    apiTokenInstance: input.apiTokenInstance.trim(),
  };
}

export function parseRecipient(
  value: string,
): { phoneNumber: number } | { username: string } {
  const text = value.trim();
  if (/^@[a-zA-Z][a-zA-Z0-9_]{3,31}$/.test(text)) return { username: text };
  if (!/^\+?[\d ()-]+$/.test(text))
    throw new Error('Введите телефон с кодом страны или @username.');
  const digits = text.replace(/\D/g, '');
  if (!/^[1-9]\d{6,14}$/.test(digits))
    throw new Error('Введите телефон с кодом страны, от 7 до 15 цифр.');
  return { phoneNumber: Number(digits) };
}

export class GreenApi {
  constructor(private credentials: Credentials) {}

  private async request<T>(
    method: string,
    verb: string,
    body?: unknown,
    signal?: AbortSignal,
    suffix = '',
  ): Promise<T> {
    const { apiUrl, idInstance, apiTokenInstance } = this.credentials;
    let response: Response;
    try {
      response = await fetch(
        `${apiUrl}/waInstance${idInstance}/${method}/${apiTokenInstance}${suffix}`,
        {
          method: verb,
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(40000)])
            : AbortSignal.timeout(20000),
          referrerPolicy: 'no-referrer',
          cache: 'no-store',
          credentials: 'omit',
        },
      );
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ApiError(
        'Нет ответа от GREEN-API. Проверьте сеть, apiUrl и доступность сервиса.',
      );
    }
    if (!response.ok) {
      const hints: Record<number, string> = {
        400: 'Проверьте параметры и настройки уведомлений: webhookUrl должен быть пустым.',
        401: 'Неверные учетные данные. Переподключитесь с данными из кабинета.',
        403: 'Доступ запрещён. Проверьте токен и тариф инстанса.',
        429: 'Превышен лимит запросов. Подождите перед повторной попыткой.',
        466: 'Лимит тарифа GREEN-API. Проверьте ограничения в кабинете.',
        469: 'Telegram временно ограничил поиск контактов. Попробуйте позже.',
      };
      // Provider error bodies and request URLs can contain credentials; never surface them.
      throw new ApiError(
        hints[response.status] ??
          `Ошибка GREEN-API (${response.status}). Попробуйте позже.`,
        response.status,
      );
    }
    const text = await response.text();
    try {
      return (text ? JSON.parse(text) : null) as T;
    } catch {
      throw new ApiError('GREEN-API вернул неожиданный ответ.');
    }
  }

  async connect(signal?: AbortSignal) {
    const state = await this.request<{ stateInstance: string }>(
      'getStateInstance',
      'GET',
      undefined,
      signal,
    );
    if (state?.stateInstance !== 'authorized')
      throw new ApiError(
        'Авторизуйте Telegram-инстанс в кабинете GREEN-API и подключитесь снова.',
      );
    const settings = await this.request<{
      webhookUrl?: string;
      incomingWebhook?: string;
      typeInstance?: string;
    }>('getSettings', 'GET', undefined, signal);
    if (settings.typeInstance && settings.typeInstance !== 'telegram')
      throw new ApiError('Нужен инстанс Telegram. Проверьте idInstance.');
    if (settings.webhookUrl || settings.incomingWebhook !== 'yes')
      throw new ApiError(
        'В кабинете очистите webhookUrl и включите incomingWebhook. После сохранения подождите минуту.',
      );
  }

  async findChat(recipient: string, signal?: AbortSignal): Promise<Chat> {
    const result = await this.request<{
      exist?: boolean;
      chatId?: string;
      username?: string;
    }>('checkAccount', 'POST', parseRecipient(recipient), signal);
    if (!result?.exist || !result.chatId)
      throw new ApiError(
        'Получатель не найден или скрыт настройками приватности. Попробуйте @username.',
      );
    return {
      id: String(result.chatId),
      name: result.username || recipient.trim(),
      phone: recipient.trim(),
      unread: 0,
    };
  }

  async send(chatId: string, message: string, signal?: AbortSignal) {
    if (!message.trim() || message.length > 4096)
      throw new Error('Сообщение должно содержать от 1 до 4096 символов.');
    const result = await this.request<{ idMessage: string }>(
      'sendMessage',
      'POST',
      { chatId, message },
      signal,
    );
    if (!result?.idMessage)
      throw new ApiError(
        'GREEN-API не подтвердил отправку. Проверьте сообщение в Telegram перед повтором.',
      );
    return String(result.idMessage);
  }

  receive(signal: AbortSignal) {
    return this.request<Notification | null>(
      'receiveNotification',
      'GET',
      undefined,
      signal,
      '?receiveTimeout=20',
    );
  }

  async acknowledge(receiptId: number, signal: AbortSignal) {
    const result = await this.request<{ result: boolean }>(
      'deleteNotification',
      'DELETE',
      undefined,
      signal,
      `/${receiptId}`,
    );
    if (!result?.result)
      throw new ApiError(
        'Не удалось подтвердить уведомление. Получение будет повторено.',
      );
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

export function parseNotification(
  notification: Notification,
): ChatEvent | null {
  const body = record(notification.body);
  if (body.typeWebhook === 'outgoingMessageStatus') {
    const statuses = ['sent', 'delivered', 'read', 'failed'];
    if (
      typeof body.idMessage === 'string' &&
      statuses.includes(String(body.status))
    ) {
      return {
        kind: 'status',
        id: body.idMessage,
        status: body.status as Message['status'],
      };
    }
  }
  if (body.typeWebhook !== 'incomingMessageReceived') return null;
  const sender = record(body.senderData);
  const data = record(body.messageData);
  const text =
    data.typeMessage === 'textMessage'
      ? record(data.textMessageData).textMessage
      : data.typeMessage === 'extendedTextMessage'
        ? record(data.extendedTextMessageData).text
        : undefined;
  if (
    typeof text !== 'string' ||
    typeof sender.chatId !== 'string' ||
    typeof body.idMessage !== 'string' ||
    typeof body.timestamp !== 'number'
  )
    return null;
  return {
    kind: 'message',
    name: String(sender.chatName || sender.senderName || sender.chatId),
    message: {
      id: body.idMessage,
      chatId: sender.chatId,
      text,
      timestamp: body.timestamp * 1000,
      direction: 'in',
    },
  };
}

export function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function pollNotifications(
  api: GreenApi,
  onEvent: (event: ChatEvent) => void,
  onError: (error: string) => void,
  signal: AbortSignal,
) {
  let failures = 0;
  while (!signal.aborted) {
    try {
      const notification = await api.receive(signal);
      if (signal.aborted) return;
      if (notification) {
        if (!Number.isSafeInteger(notification.receiptId) || !notification.body)
          throw new ApiError('Некорректный формат уведомления GREEN-API.');
        const event = parseNotification(notification);
        if (event) onEvent(event);
        await api.acknowledge(notification.receiptId, signal);
      }
      failures = 0;
      onError('');
      await delay(300, signal);
    } catch (error) {
      if (signal.aborted) return;
      onError(
        error instanceof Error ? error.message : 'Ошибка получения сообщений.',
      );
      if (error instanceof ApiError && [400, 401, 403].includes(error.status))
        return;
      try {
        await delay(
          Math.min(30000, 2000 * 2 ** Math.min(failures++, 4)),
          signal,
        );
      } catch {
        return;
      }
    }
  }
}
