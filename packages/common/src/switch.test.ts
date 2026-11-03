// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { createSwitch } from './switch';

describe('createSwitch', () => {
  it('renders an accessible switch in its initial state', () => {
    const { element } = createSwitch({ label: 'Raw', checked: true });
    expect(element.tagName).toBe('BUTTON');
    expect(element.type).toBe('button');
    expect(element.getAttribute('role')).toBe('switch');
    expect(element.getAttribute('aria-label')).toBe('Raw');
    expect(element.getAttribute('aria-checked')).toBe('true');
    expect(element.querySelector('.spl-switch__knob')).not.toBeNull();
  });

  it('flips on click and reports the new state', () => {
    const onToggle = vi.fn();
    const { element } = createSwitch({ label: 'Raw', onToggle });
    element.click();
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(element.getAttribute('aria-checked')).toBe('true');
  });

  it('keeps its state when the change is refused', () => {
    const { element } = createSwitch({ label: 'Raw', checked: true, onToggle: () => false });
    element.click();
    expect(element.getAttribute('aria-checked')).toBe('true');
  });

  it('ignores clicks while disabled, and setters update it', () => {
    const onToggle = vi.fn();
    const handle = createSwitch({ label: 'Raw', disabled: true, onToggle });
    handle.element.click();
    expect(onToggle).not.toHaveBeenCalled();

    handle.setDisabled(false);
    handle.setChecked(true);
    expect(handle.element.disabled).toBe(false);
    expect(handle.element.getAttribute('aria-checked')).toBe('true');
  });
});
