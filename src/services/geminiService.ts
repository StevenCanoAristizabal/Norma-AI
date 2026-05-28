
export const chatWithAssistant = async (
  history: { role: 'user' | 'model'; parts: { text: string }[] }[],
  message: string
): Promise<string> => {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ history, message }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error((data as any).error || 'Error en la respuesta del servidor.');
  }

  return (data as any).response as string;
};
