import { useMutation } from '@tanstack/react-query';

type ChatMessageInput = { role: string; content: string };

/** Smart-brain action the server may return alongside a chat reply. */
export type ChatAction =
  | { type: 'open_url'; url: string; displayName: string }
  | { type: 'build_project'; description: string };

export type ChatResponse = {
  text: string;
  action?: ChatAction;
  multiStep?: boolean;
  plan?: string[];
};

/**
 * Replacement for @workspace/api-client-react's useSendMairaChatMessage.
 * POSTs to /api/openai/chat and resolves with { text, action?, multiStep?, plan? }.
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
      return res.json() as Promise<ChatResponse>;
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

/**
 * Ask the server to generate a complete single-file website from a
 * description. Resolves with { html }.
 */
export async function buildProject({ description }: { description: string }) {
  const res = await fetch('/api/build-project', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw { data: errData };
  }
  return res.json() as Promise<{ html: string }>;
}
