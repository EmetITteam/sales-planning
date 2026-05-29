# 03 · UI Components

## Сторінка `/admin/analytics`

```
┌─ Header (з existing sales-planning) ────────────────────────────┐
│  EMET · Sales Planning            [navbar]            [profile]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Аналітика продажів                                              │
│  Запитуй про продажі — отримуй цифри з 1С                       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ [Chat messages area]                                     │   │
│  │                                                           │   │
│  │  user: скільки сплячих ESSE B2B?                         │   │
│  │                                                           │   │
│  │  assistant: Перевіряю на 26.05.2026...                   │   │
│  │  ┌────────────────────────────┐                          │   │
│  │  │ SQL query (collapsible)    │                          │   │
│  │  └────────────────────────────┘                          │   │
│  │  | Сегмент | Сплячих | %    |                            │   │
│  │  | B2B     | 190     | 19.3%|                            │   │
│  │                                                           │   │
│  │  📎 Сплячі_ESSE_B2B.xlsx                                 │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────┬─────────┐ │
│  │ Запит до даних...                                │  ↑      │ │
│  └──────────────────────────────────────────────────┴─────────┘ │
│  [Sonnet] [Opus]   ~$0.06 за запит                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Компоненти

### `page.tsx` (Server Component)

```tsx
// src/app/admin/analytics/page.tsx
import { ChatInterface } from './ChatInterface';
import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function AnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // (опційно) Перевірка ролі — тільки IT Director / admin
  if (!user.permissions.includes('analytics')) redirect('/');

  return (
    <div className="container max-w-5xl py-8">
      <h1 className="text-3xl font-bold mb-1">Аналітика продажів</h1>
      <p className="text-muted-foreground mb-8">
        Запитуй про продажі — отримуй цифри з 1С
      </p>
      <ChatInterface userId={user.id} />
    </div>
  );
}
```

### `ChatInterface.tsx` (Client Component)

```tsx
'use client';
import { useState, useRef, useEffect } from 'react';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  xlsxUrl?: string;
  usage?: { cost_usd: number };
}

export function ChatInterface({ userId }: { userId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [model, setModel] = useState<'sonnet' | 'opus'>('sonnet');
  const scrollRef = useRef<HTMLDivElement>(null);

  async function sendMessage(text: string) {
    const newMessages = [...messages, { role: 'user' as const, content: text }];
    setMessages(newMessages);
    setStreaming(true);

    // Push placeholder for streaming assistant message
    setMessages([...newMessages, { role: 'assistant', content: '' }]);

    const res = await fetch('/api/analytics/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history: messages,
        model_override: model,
      }),
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let current = '';
    let xlsxUrl: string | undefined;
    let usage: any;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const event = JSON.parse(line.slice(6));
        if (event.type === 'text_delta') {
          current += event.text;
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', content: current };
            return next;
          });
        } else if (event.type === 'xlsx_link') {
          xlsxUrl = event.url;
        } else if (event.type === 'done') {
          usage = event.usage;
        }
      }
    }

    setMessages((prev) => {
      const next = [...prev];
      next[next.length - 1] = { role: 'assistant', content: current, xlsxUrl, usage };
      return next;
    });
    setStreaming(false);
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-[calc(100vh-200px)]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.map((m, i) => <MessageBubble key={i} message={m} />)}
        {messages.length === 0 && <EmptyState onPick={sendMessage} />}
      </div>
      <ChatInput
        onSend={sendMessage}
        disabled={streaming}
        model={model}
        onModelChange={setModel}
      />
    </div>
  );
}
```

### `MessageBubble.tsx`

```tsx
import { TableRenderer } from './TableRenderer';
import { CodeBlock } from './CodeBlock';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Download } from 'lucide-react';

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'rounded-2xl px-4 py-3 max-w-[85%]',
        isUser
          ? 'bg-[#066AAB] text-white'
          : 'bg-card border'
      )}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code: ({ inline, className, children }) =>
              inline
                ? <code className="px-1 bg-muted rounded">{children}</code>
                : <CodeBlock language={className?.replace('language-','')}>{String(children)}</CodeBlock>,
            table: (props) => <TableRenderer {...props} />,
          }}
        >
          {message.content}
        </ReactMarkdown>

        {message.xlsxUrl && (
          <a
            href={message.xlsxUrl}
            download
            className="mt-2 inline-flex items-center gap-2 text-sm text-[#066AAB] hover:underline"
          >
            <Download size={16} />
            Завантажити Excel
          </a>
        )}

        {message.usage && (
          <div className="mt-2 text-xs text-muted-foreground">
            {message.usage.cost_usd.toFixed(3)} USD
          </div>
        )}
      </div>
    </div>
  );
}
```

### `ChatInput.tsx`

```tsx
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send } from 'lucide-react';

export function ChatInput({ onSend, disabled, model, onModelChange }: Props) {
  const [text, setText] = useState('');

  function handleSubmit() {
    if (!text.trim() || disabled) return;
    onSend(text);
    setText('');
  }

  return (
    <div className="border-t pt-4 space-y-2">
      <div className="flex gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Запит до даних..."
          className="resize-none"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <Button onClick={handleSubmit} disabled={disabled}>
          <Send size={16} />
        </Button>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex gap-2">
          <button
            onClick={() => onModelChange('sonnet')}
            className={cn(
              'px-2 py-1 rounded',
              model === 'sonnet' ? 'bg-[#066AAB] text-white' : 'bg-muted'
            )}>
            Sonnet
          </button>
          <button
            onClick={() => onModelChange('opus')}
            className={cn(
              'px-2 py-1 rounded',
              model === 'opus' ? 'bg-[#066AAB] text-white' : 'bg-muted'
            )}>
            Opus
          </button>
        </div>
        <div>~${model === 'opus' ? '0.30' : '0.06'} за запит</div>
      </div>
    </div>
  );
}
```

### `EmptyState` (підказки запитів)

```tsx
function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  const suggestions = [
    'Скільки сплячих клієнтів ESSE по сегментах?',
    'Розподіл клієнтів Vitaran B2B 2026 по чеках за місяць',
    'Унікальні клієнти за 2025 і 2026 окремо B2B і B2C',
    'Топ-10 клієнтів по сумі покупок за останній квартал',
  ];

  return (
    <div className="text-center py-12">
      <h2 className="text-xl font-medium mb-2">Що порахуємо?</h2>
      <p className="text-muted-foreground mb-6">Можеш писати своїми словами або взяти приклад</p>
      <div className="grid gap-2 max-w-md mx-auto">
        {suggestions.map((q) => (
          <button
            key={q}
            onClick={() => onPick(q)}
            className="text-left px-4 py-3 rounded-xl border hover:border-[#066AAB] transition-colors"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
```

## Бібліотеки

- `react-markdown` + `remark-gfm` — рендер markdown з GFM-таблицями
- `shadcn/ui` (Button, Textarea) — вже в проекті
- `lucide-react` — іконки
- `prism-react-renderer` або `shiki` — syntax highlight для SQL/Python

## Стилі

Використати існуючі CSS-змінні sales-planning:
- `bg-card`, `border`, `text-muted-foreground` — shadcn defaults
- `--primary: #066AAB` — переконатися що це EMET-синій
- Шрифт `Plus Jakarta Sans` (тіло) і `JetBrains Mono` (код) — з CLAUDE.md

## Адаптивність

- Mobile: full-width chat, bottom-fixed input
- Tablet/Desktop: max-w-5xl центрований
- Дуже довгі таблиці — overflow-x-scroll з sticky first column

## Доступність

- Aria-labels на всі кнопки
- Focus management при стрімінгу
- Контраст текстів — перевірити EMET-синій на білому (повинно бути ≥ 4.5:1)

## Smoke test перед deploy

1. Empty state → клік по suggestion → відповідь стрімиться
2. Power user: послідовність 5+ повідомлень → memory працює
3. Дуже довга таблиця (150 рядків) → горизонтальний scroll OK
4. xlsx-link клік → файл качається, відкривається в Excel
5. Mobile (375px) — input не перекриває чат
