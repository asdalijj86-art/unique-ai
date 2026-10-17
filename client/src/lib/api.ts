import { useMutation } from '@tanstack/react-query';

type ChatMessageInput = { role: string; content: string };

/**
 * Replacement for @workspace/api-client-react's useSendMairaChatMessage.
 * POSTs to /api/openai/chat and resolves with { text }.
 */
export function useSendMairaChatMessage() {
  return useMutation({
    mutationFn: async ({ data }: { data: { messages: ChatMessageInput[] } }) => {
      const res = await fetch('/api/openai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw { data: errData };
      }
      return res.json() as Promise<{ text: string }>;
    },
  });
}

/**
 * Replacement for @workspace/api-client-react's synthesizeMairaSpeech.
 * POSTs to /api/openai/speech and resolves with { audioBase64, mimeType }.
 */
export async function synthesizeMairaSpeech({ text }: { text: string }) {
  const res = await fetch('/api/openai/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw { data: errData };
  }
  return res.json() as Promise<{ audioBase64: string; mimeType: string }>;
}
