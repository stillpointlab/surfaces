// The password form `<pdf-preview>` shows in place of the pages while pdf.js
// waits for a password: a sentence, a field labelled "Password", an Open button,
// and a line for what went wrong. It is the house's small form (a `label` around
// a `span` and the `input`, an error line with `role="alert"`, `aria-invalid`
// and `aria-describedby`), in a group the sentence names.

/** What the form says: while it asks, after a wrong one, and for an empty field. */
export const UNLOCK_WORDS = {
  ask: 'This PDF needs a password to open.',
  wrong: "That password didn't open it. Try again.",
  empty: 'Type the password first.',
} as const;

/**
 * The form. The field's value is read when Open is pressed or Enter is pressed
 * in the field, the field is emptied at once, and the value is handed to
 * `onSubmit`; nothing here keeps it. An empty field sends nothing.
 *
 * - No `<form>`: there is nothing to submit to, and Enter is heard on the field.
 * - `type="password"`: a browser never keeps its value in form history.
 * - `autocomplete="one-time-code"`: Chromium then offers no save of it as a
 *   login for the host's origin. Firefox still offers; nothing short of a field
 *   that is not a password field stops it (the README's "Known and left").
 * - The first ask takes no focus, so a person moving through a host's files is
 *   not pulled into it; after a wrong one the focus is put in the field.
 */
export class Unlock {
  readonly element: HTMLDivElement;
  private readonly field: HTMLInputElement;
  private readonly error: HTMLParagraphElement;

  constructor(private readonly onSubmit: (password: string) => void) {
    // The ids are the shadow root's own: one form an element.
    this.element = document.createElement('div');
    this.element.className = 'pdf-preview__unlock';
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-labelledby', 'pdf-unlock-sentence');
    const sentence = document.createElement('p');
    sentence.id = 'pdf-unlock-sentence';
    sentence.className = 'pdf-preview__unlock-sentence';
    sentence.textContent = UNLOCK_WORDS.ask;

    const label = document.createElement('label');
    label.className = 'pdf-preview__unlock-field';
    const name = document.createElement('span');
    name.textContent = 'Password';
    this.field = document.createElement('input');
    this.field.type = 'password';
    this.field.setAttribute('autocomplete', 'one-time-code');
    this.field.setAttribute('autocapitalize', 'off');
    this.field.spellcheck = false;
    this.field.setAttribute('aria-describedby', 'pdf-unlock-error');
    label.append(name, this.field);

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'pdf-preview__unlock-open';
    open.textContent = 'Open';

    const row = document.createElement('div');
    row.className = 'pdf-preview__unlock-row';
    row.append(label, open);
    this.error = document.createElement('p');
    this.error.id = 'pdf-unlock-error';
    this.error.className = 'pdf-preview__unlock-error';
    this.error.setAttribute('role', 'alert');
    this.element.append(sentence, row, this.error);

    open.addEventListener('click', () => this.send());
    this.field.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      this.send();
    });
  }

  /**
   * pdf.js asks: for the first time, or again after a wrong one, which is said,
   * marked on the field, and given the focus. Call once the form is shown.
   */
  ask(wrong: boolean): void {
    this.say(wrong ? UNLOCK_WORDS.wrong : '');
    if (wrong) this.field.focus();
  }

  /** Empty the field and the error line: the source is let go. */
  clear(): void {
    this.field.value = '';
    this.say('');
  }

  private say(error: string): void {
    this.error.textContent = error;
    if (error) this.field.setAttribute('aria-invalid', 'true');
    else this.field.removeAttribute('aria-invalid');
  }

  private send(): void {
    const password = this.field.value;
    this.field.value = '';
    if (!password) {
      this.say(UNLOCK_WORDS.empty);
      this.field.focus();
      return;
    }
    this.onSubmit(password);
  }
}
