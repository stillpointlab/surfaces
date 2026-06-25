/// <reference lib="dom" />

// Minimal toggle switch for the editor toolbar (replaces the host's spl-toggle).
// Emits `md-toggle` with `{ checked }` on change.

export class MdToggleEvent extends CustomEvent<{ checked: boolean }> {
  constructor(checked: boolean) {
    super('md-toggle', { detail: { checked }, bubbles: true, composed: true });
  }
}

const STYLE = `
  :host { display: inline-flex; }
  button {
    --w: 34px; --h: 18px;
    position: relative; width: var(--w); height: var(--h);
    border: none; border-radius: 999px; background: #ccc; cursor: pointer;
    padding: 0; transition: background-color 0.2s ease;
  }
  button.on { background: #0066cc; }
  .knob {
    position: absolute; top: 2px; left: 2px; width: 14px; height: 14px;
    border-radius: 50%; background: #fff; transition: transform 0.2s ease;
  }
  button.on .knob { transform: translateX(16px); }
`;

export class MdToggle extends HTMLElement {
  private root: ShadowRoot;

  static get observedAttributes(): string[] {
    return ['checked'];
  }

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
  }

  attributeChangedCallback(): void {
    this.render();
  }

  get checked(): boolean {
    return this.hasAttribute('checked');
  }

  set checked(value: boolean) {
    if (value) this.setAttribute('checked', '');
    else this.removeAttribute('checked');
  }

  private render(): void {
    const on = this.checked;
    this.root.innerHTML = `<style>${STYLE}</style><button type="button" role="switch" aria-checked="${on}" class="${on ? 'on' : ''}"><span class="knob"></span></button>`;
    const button = this.root.querySelector('button');
    button?.addEventListener('click', () => {
      this.checked = !this.checked;
      this.dispatchEvent(new MdToggleEvent(this.checked));
    });
  }
}

if (!customElements.get('md-toggle')) {
  customElements.define('md-toggle', MdToggle);
}
