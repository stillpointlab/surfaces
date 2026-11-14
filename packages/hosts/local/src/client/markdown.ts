// Markdown is untrusted: a file in the served folder can hold anything. The md
// preview's default renderer does not sanitize, so the page installs its own, as
// Context Manager does: the md package's markdown-it rendering (which already
// leaves raw HTML as text), then DOMPurify over the result. The pane awaits the
// install before it mounts any md element, so nothing renders with the default.

import DOMPurify from 'dompurify';

let hooked = false;

/** The rendered markup made safe to place: no script, handler, `javascript:` URL or style. */
export function sanitizeMarkdownHtml(markup: string): string {
  if (!hooked) {
    hooked = true;
    // A link leaves in a tab of its own, so following one never unloads the page.
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.nodeName !== 'A') return;
      const href = node.getAttribute('href');
      if (href === null || href.startsWith('#')) return;
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    });
  }
  return DOMPurify.sanitize(markup, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'option'],
    FORBID_ATTR: ['style'],
  });
}

let installed: Promise<void> | null = null;

/**
 * Install the sanitizing renderer into `<md-preview>`'s module. Resolves once it
 * is in place; a failure is not kept, so the next open tries again.
 */
export function installMarkdownRenderer(): Promise<void> {
  installed ??= (async () => {
    const [{ setPreviewRenderer }, { renderMarkdown }] = await Promise.all([
      import('@stillpointlab/md-format/preview'),
      import('@stillpointlab/md-format/markdown'),
    ]);
    setPreviewRenderer(async (content, options) =>
      sanitizeMarkdownHtml(await renderMarkdown(content, { frontmatter: options?.frontmatter }))
    );
  })().catch((error: unknown) => {
    installed = null;
    throw error;
  });
  return installed;
}
