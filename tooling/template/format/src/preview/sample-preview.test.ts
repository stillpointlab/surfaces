import { beforeAll, describe, expect, it } from 'vitest';

import type { SamplePreview } from './sample-preview';

describe('<sample-preview>', () => {
  beforeAll(async () => {
    await import('./index');
  });

  it('renders the content it is given', () => {
    const preview = document.createElement('sample-preview') as SamplePreview;
    document.body.append(preview);
    preview.setContent('hello\nworld');
    expect(preview.shadowRoot?.querySelector('pre')?.textContent).toBe('hello\nworld');
  });
});
