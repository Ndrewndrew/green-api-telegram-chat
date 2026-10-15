// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('completes login → phone lookup → send → receive → logout using the real adapter and mocked HTTP', async () => {
  let queued = false;
  const requests: { url: string; method?: string; body?: unknown }[] = [];
  const fetcher = vi.fn(async (input: string, options: RequestInit) => {
    requests.push({
      url: input,
      method: options.method,
      body: options.body ? JSON.parse(String(options.body)) : undefined,
    });
    if (input.includes('/getStateInstance/'))
      return Response.json({ stateInstance: 'authorized' });
    if (input.includes('/getSettings/'))
      return Response.json({
        typeInstance: 'telegram',
        incomingWebhook: 'yes',
        webhookUrl: '',
      });
    if (input.includes('/checkAccount/'))
      return Response.json({
        exist: true,
        chatId: '10000000',
        username: '@alex_test',
      });
    if (input.includes('/sendMessage/')) {
      queued = true;
      return Response.json({ idMessage: 'sent-123' });
    }
    if (input.includes('/deleteNotification/'))
      return Response.json({ result: true });
    if (input.includes('/receiveNotification/')) {
      if (queued) {
        queued = false;
        return Response.json({
          receiptId: 42,
          body: {
            typeWebhook: 'incomingMessageReceived',
            idMessage: 'reply-123',
            timestamp: 1763115112,
            senderData: { chatId: '10000000', chatName: 'Алексей' },
            messageData: {
              typeMessage: 'textMessage',
              textMessageData: { textMessage: 'Ответ из тестового API' },
            },
          },
        });
      }
      return Response.json(null);
    }
    throw new Error('Unexpected test request');
  });
  vi.stubGlobal('fetch', fetcher);
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText('idInstance'), '4100000000');
  await user.type(screen.getByLabelText('apiTokenInstance'), 'fixture-token');
  await user.click(screen.getByRole('button', { name: 'Подключить Telegram' }));
  await screen.findByText('Начните разговор');
  await user.type(screen.getByLabelText('Новый чат'), '+79991234567');
  await user.click(screen.getByRole('button', { name: 'Создать чат' }));
  const textarea = await screen.findByLabelText('Текст сообщения');
  await user.type(textarea, 'Проверка отправки{Enter}');
  await within(screen.getByRole('log')).findByText('Ответ из тестового API');
  await waitFor(() =>
    expect(
      requests.some(
        (r) => r.url.includes('/deleteNotification/') && r.method === 'DELETE',
      ),
    ).toBe(true),
  );
  expect(requests.find((r) => r.url.includes('/sendMessage/'))?.body).toEqual({
    chatId: '10000000',
    message: 'Проверка отправки',
  });
  expect(requests.find((r) => r.url.includes('/checkAccount/'))?.body).toEqual({
    phoneNumber: 79991234567,
  });
  expect(window.localStorage.length).toBe(0);
  expect(window.sessionStorage.length).toBe(0);
  await user.click(screen.getByRole('button', { name: 'Выйти из чата' }));
  await screen.findByRole('button', { name: 'Подключить Telegram' });
  expect(
    (screen.getByLabelText('apiTokenInstance') as HTMLInputElement).value,
  ).toBe('');
});

it('uses demo without network access and preserves drafts between chats', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Посмотреть демо' }));
  await user.type(screen.getByLabelText('Текст сообщения'), 'Черновик Алексею');
  await user.type(screen.getByLabelText('Новый чат'), '@second_user');
  await user.click(screen.getByRole('button', { name: 'Создать чат' }));
  expect(
    (screen.getByLabelText('Текст сообщения') as HTMLTextAreaElement).value,
  ).toBe('');
  await user.click(screen.getByRole('button', { name: /Алексей/ }));
  expect(
    (screen.getByLabelText('Текст сообщения') as HTMLTextAreaElement).value,
  ).toBe('Черновик Алексею');
  await user.type(
    screen.getByLabelText('Текст сообщения'),
    '{Shift>}{Enter}{/Shift}Вторая строка',
  );
  expect(
    (screen.getByLabelText('Текст сообщения') as HTMLTextAreaElement).value,
  ).toContain('\nВторая строка');
  expect(fetcher).not.toHaveBeenCalled();
});

it('shows a send failure without silently resending or losing text', async () => {
  const fetcher = vi.fn(async (input: string) => {
    if (input.includes('getStateInstance'))
      return Response.json({ stateInstance: 'authorized' });
    if (input.includes('getSettings'))
      return Response.json({ incomingWebhook: 'yes', webhookUrl: '' });
    if (input.includes('checkAccount'))
      return Response.json({ exist: true, chatId: '10000000' });
    if (input.includes('sendMessage')) throw new Error('Network disconnected');
    return Response.json(null);
  });
  vi.stubGlobal('fetch', fetcher);
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText('idInstance'), '4100000000');
  await user.type(screen.getByLabelText('apiTokenInstance'), 'fixture-token');
  await user.click(screen.getByRole('button', { name: 'Подключить Telegram' }));
  await screen.findByText('Начните разговор');
  await user.type(screen.getByLabelText('Новый чат'), '@alex_test');
  await user.click(screen.getByRole('button', { name: 'Создать чат' }));
  await user.type(
    await screen.findByLabelText('Текст сообщения'),
    'Сохранить этот текст{Enter}',
  );
  const restore = await screen.findByRole('button', {
    name: 'Вернуть текст в поле',
  });
  await user.click(restore);
  expect(
    (screen.getByLabelText('Текст сообщения') as HTMLTextAreaElement).value,
  ).toBe('Сохранить этот текст');
  expect(
    fetcher.mock.calls.filter(([url]) => url.includes('sendMessage')),
  ).toHaveLength(1);
});
