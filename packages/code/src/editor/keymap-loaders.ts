import type { Extension } from '@codemirror/state';

export async function loadVimKeymapExtension(): Promise<Extension> {
  const { vim } = await import('@replit/codemirror-vim');
  return vim();
}
