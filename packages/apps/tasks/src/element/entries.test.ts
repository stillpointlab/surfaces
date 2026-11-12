// @vitest-environment jsdom
/// <reference lib="dom" />
import { describe, expect, it } from 'vitest';

import * as element from './index.js';

// The create form is its own entry, `./create-element`, so a page that only
// shows the app does not load it (the stage 3 follow-up on the app pages' size).
describe('the element entries', () => {
  it('`./element` neither exports nor registers the create form', () => {
    expect('TasksCreate' in element).toBe(false);
    expect(customElements.get('spl-tasks-create')).toBeUndefined();
  });

  it('`./create-element` registers it', async () => {
    const create = await import('./create.js');
    expect(customElements.get('spl-tasks-create')).toBe(create.TasksCreate);
  });
  it("exports the strip's reload request, as inventory's entry exports its own", () => {
    expect(element.RELOAD_REQUEST_EVENT).toBe('reload-request');
  });
});
