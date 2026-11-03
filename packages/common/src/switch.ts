// The on/off switch every editor toolbar uses (md's raw toggle, xmdl's mode
// switch): a `<button role="switch">` with a knob, styled by
// `@use 'common/src/styles/switch';`.

export interface SwitchOptions {
  /** The accessible name. */
  label: string;
  checked?: boolean;
  disabled?: boolean;
  /**
   * Called with the requested state when the user toggles it. Return false to
   * refuse the change (for example after a declined confirmation); the switch
   * then keeps its current state.
   */
  onToggle?: (checked: boolean) => boolean | void;
}

export interface SwitchHandle {
  readonly element: HTMLButtonElement;
  setChecked(checked: boolean): void;
  setDisabled(disabled: boolean): void;
}

export function createSwitch(options: SwitchOptions): SwitchHandle {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'spl-switch';
  element.setAttribute('role', 'switch');
  element.setAttribute('aria-label', options.label);
  const knob = document.createElement('span');
  knob.className = 'spl-switch__knob';
  element.append(knob);

  const setChecked = (checked: boolean) => {
    element.setAttribute('aria-checked', checked ? 'true' : 'false');
  };
  const setDisabled = (disabled: boolean) => {
    element.disabled = disabled;
  };
  setChecked(options.checked ?? false);
  setDisabled(options.disabled ?? false);

  element.addEventListener('click', () => {
    if (element.disabled) return;
    const next = element.getAttribute('aria-checked') !== 'true';
    if (options.onToggle?.(next) === false) return;
    setChecked(next);
  });

  return { element, setChecked, setDisabled };
}
