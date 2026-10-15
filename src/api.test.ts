import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  GreenApi,
  parseNotification,
  parseRecipient,
  pollNotifications,
  validateCredentials,
} from './api';
import type { Notification } from './api';
import { chatReducer, emptyState } from './chat';

const credentials = {
  apiUrl: 'https://4100.api.green-api.com',
  idInstance: '4100000000',
  apiTokenInstance: 'test-token',
};
const api = () => new GreenApi(credentials);
const fixture: Notification = {
  receiptId: 42,
  body: {
    typeWebhook: 'incomingMessageReceived',
    idMessage: '1763115112345',
    timestamp: 1763115112,
    senderData: { chatId: '10000000', chatName: 'Алексей' },
    messageData: {
      typeMessage: 'textMessage',
      textMessageData: { textMessage: 'Ответ из Telegram' },
    },
  },
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Telegram recipient and credential validation', () => {
  it('resolves a phone independently of Telegram chat IDs', () => {
    expect(parseRecipient('+7 (999) 123-45-67')).toEqual({
      phoneNumber: 79991234567,
    });
    expect(parseRecipient('@alex_demo')).toEqual({ username: '@alex_demo' });
    expect(() => parseRecipient('8foo9991234567')).toThrow();
    expect(() => parseRecipient('123')).toThrow();
  });
  it('does not allow sending tokens to arbitrary origins or URL paths', () => {
    expect(validateCredentials(credentials)).toEqual(credentials);
    for (const apiUrl of [
      'http://api.green-api.com',
      'https://api.green-api.com.evil.com',
      'https://evil.com',
      'https://api.green-api.com/path',
      'https://a:b@api.green-api.com',
      'https://api.green-api.com/?x=1',
    ]) {
      expect(() => validateCredentials({ ...credentials, apiUrl })).toThrow();
    }
    expect(() =>
      validateCredentials({ ...credentials, apiTokenInstance: 'token/extra' }),
    ).toThrow();
  });
});

describe('GREEN-API requests', () => {
  it('requires authorized Telegram and HTTP notification settings', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ stateInstance: 'authorized' }))
      .mockResolvedValueOnce(
        Response.json({
          typeInstance: 'telegram',
          incomingWebhook: 'yes',
          webhookUrl: '',
        }),
      );
    vi.stubGlobal('fetch', fetcher);
    await api().connect();
    expect(fetcher.mock.calls[0][0]).toContain('/getStateInstance/');
    expect(fetcher.mock.calls[1][0]).toContain('/getSettings/');
  });
  it('rejects an unauthorized instance before reading settings', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ stateInstance: 'notAuthorized' }));
    vi.stubGlobal('fetch', fetcher);
    await expect(api().connect()).rejects.toThrow('Авторизуйте');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not silently override webhook settings', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ stateInstance: 'authorized' }))
      .mockResolvedValueOnce(
        Response.json({
          incomingWebhook: 'yes',
          webhookUrl: 'https://example.com/webhook',
        }),
      );
    vi.stubGlobal('fetch', fetcher);
    await expect(api().connect()).rejects.toThrow('webhookUrl');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('finds a phone recipient, then sends to the resolved chatId', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ exist: true, chatId: '10000000' }))
      .mockResolvedValueOnce(Response.json({ idMessage: 'message-1' }));
    vi.stubGlobal('fetch', fetcher);
    const client = api();
    const chat = await client.findChat('+79991234567');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      phoneNumber: 79991234567,
    });
    expect(await client.send(chat.id, 'Привет')).toBe('message-1');
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
      chatId: '10000000',
      message: 'Привет',
    });
    expect(fetcher.mock.calls[1][0]).toBe(
      `${credentials.apiUrl}/waInstance4100000000/sendMessage/test-token`,
    );
  });
  it('rejects missing/hidden recipients and blank/overlong messages', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ exist: false, chatId: '' }));
    vi.stubGlobal('fetch', fetcher);
    await expect(api().findChat('@hidden_user')).rejects.toThrow('приватности');
    await expect(api().send('1', ' ')).rejects.toThrow();
    await expect(api().send('1', 'x'.repeat(4097))).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('handles empty long-poll responses and confirms receipts using DELETE', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(''))
      .mockResolvedValueOnce(Response.json({ result: true }));
    vi.stubGlobal('fetch', fetcher);
    const signal = new AbortController().signal;
    expect(await api().receive(signal)).toBeNull();
    await api().acknowledge(42, signal);
    expect(fetcher.mock.calls[0][0]).toContain('?receiveTimeout=20');
    expect(fetcher.mock.calls[1][0]).toContain(
      '/deleteNotification/test-token/42',
    );
    expect(fetcher.mock.calls[1][1].method).toBe('DELETE');
  });
  it('does not expose a provider response containing secrets', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('secret-token-url', { status: 401 })),
    );
    await expect(api().send('1', 'Привет')).rejects.toThrow(
      'Неверные учетные данные',
    );
  });
});

describe('notification queue and state', () => {
  it('parses text and URL text, ignoring unrelated media and outgoing echoes', () => {
    const event = parseNotification(fixture);
    expect(event?.kind).toBe('message');
    if (event?.kind === 'message')
      expect(event.message).toMatchObject({
        chatId: '10000000',
        text: 'Ответ из Telegram',
        timestamp: 1763115112000,
      });
    expect(
      parseNotification({
        ...fixture,
        body: {
          ...fixture.body,
          messageData: {
            typeMessage: 'extendedTextMessage',
            extendedTextMessageData: { text: 'https://example.com' },
          },
        },
      })?.kind,
    ).toBe('message');
    expect(
      parseNotification({
        receiptId: 1,
        body: {
          typeWebhook: 'incomingMessageReceived',
          messageData: { typeMessage: 'imageMessage' },
        },
      }),
    ).toBeNull();
    expect(
      parseNotification({
        ...fixture,
        body: { ...fixture.body, typeWebhook: 'outgoingAPIMessageReceived' },
      }),
    ).toBeNull();
  });
  it('deduplicates replayed notifications, counts unread only in inactive chats', () => {
    const event = parseNotification(fixture)!;
    const first = chatReducer(emptyState, { type: 'event', event });
    expect(first.chats[0].unread).toBe(1);
    expect(chatReducer(first, { type: 'event', event })).toBe(first);
    const selected = chatReducer(first, { type: 'select', id: '10000000' });
    expect(selected.chats[0].unread).toBe(0);
    expect(selected.messages).toHaveLength(1);
  });
  it('preserves per-chat drafts and does not downgrade read status', () => {
    const first = chatReducer(emptyState, {
      type: 'draft',
      chatId: '1',
      text: 'Черновик',
    });
    expect(
      chatReducer(first, { type: 'draft', chatId: '2', text: 'Другой' }).drafts[
        '1'
      ],
    ).toBe('Черновик');
    const state = chatReducer(emptyState, {
      type: 'append',
      message: {
        id: '1',
        chatId: 'a',
        direction: 'out',
        timestamp: 0,
        text: 'Привет',
        status: 'read',
      },
    });
    expect(
      chatReducer(state, {
        type: 'event',
        event: { kind: 'status', id: '1', status: 'sent' },
      }).messages[0].status,
    ).toBe('read');
  });
  it('processes before acknowledgement, retries a failed acknowledgement without duplicating the message', async () => {
    vi.useFakeTimers();
    const client = api();
    const abort = new AbortController();
    vi.spyOn(client, 'receive').mockResolvedValue(fixture);
    vi.spyOn(client, 'acknowledge')
      .mockRejectedValueOnce(new ApiError('ack failed'))
      .mockImplementationOnce(async () => {
        abort.abort();
      });
    let state = emptyState;
    const onEvent = vi.fn((event) => {
      state = chatReducer(state, { type: 'event', event });
    });
    const errors = vi.fn();
    const polling = pollNotifications(client, onEvent, errors, abort.signal);
    await vi.advanceTimersByTimeAsync(2100);
    await polling;
    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(state.messages).toHaveLength(1);
    expect(client.acknowledge).toHaveBeenCalledWith(42, abort.signal);
    expect(errors).toHaveBeenCalledWith('ack failed');
  });
  it('stops on invalid credentials and cancels long polling when leaving', async () => {
    const client = api();
    vi.spyOn(client, 'receive').mockRejectedValue(
      new ApiError('unauthorized', 401),
    );
    const errors = vi.fn();
    await pollNotifications(
      client,
      vi.fn(),
      errors,
      new AbortController().signal,
    );
    expect(client.receive).toHaveBeenCalledTimes(1);
    const abort = new AbortController();
    const handler = vi.fn();
    vi.spyOn(client, 'receive').mockImplementation(async () => {
      abort.abort();
      return fixture;
    });
    await pollNotifications(client, handler, errors, abort.signal);
    expect(handler).not.toHaveBeenCalled();
  });
});
