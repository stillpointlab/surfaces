export const previewStyles = `
:host {
  display: block;
  min-height: 0;
  height: 100%;
  color: var(--color-text, #1f2933);
  background: var(--color-surface, #ffffff);
}

.image-preview {
  box-sizing: border-box;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  min-height: 220px;
  padding: 16px;
  overflow: auto;
}

.image-preview__frame {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  min-height: 188px;
}

.image-preview__image {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.image-preview__message {
  color: var(--color-text-muted, #667085);
  font: 14px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  text-align: center;
}

.image-preview__message--error {
  color: var(--color-danger, #b42318);
}

.image-preview__loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
  background: color-mix(in srgb, var(--color-surface, #ffffff) 78%, transparent);
}
`;
