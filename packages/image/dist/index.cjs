"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  ImagePreview: () => ImagePreview,
  setErrorHandler: () => setErrorHandler
});
module.exports = __toCommonJS(src_exports);

// src/preview/log.ts
var errorHandler = null;
function setErrorHandler(handler) {
  errorHandler = handler;
}
function reportError(message, error) {
  if (errorHandler) {
    errorHandler(message, error);
    return;
  }
  console.error(message, error);
}

// src/preview/preview.styles.ts
var previewStyles = `
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

// src/preview/image-preview.ts
var ImagePreview = class extends HTMLElement {
  root;
  state = "empty";
  static get observedAttributes() {
    return ["src", "alt"];
  }
  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
  }
  connectedCallback() {
    this.syncStateFromSource();
    this.render();
  }
  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === "src") {
      this.syncStateFromSource();
    }
    if (this.isConnected) this.render();
  }
  setSource(src, alt) {
    if (alt !== void 0) {
      this.setAttribute("alt", alt);
    }
    if (src) {
      this.setAttribute("src", src);
    } else {
      this.removeAttribute("src");
    }
  }
  get src() {
    return this.getAttribute("src")?.trim() ?? "";
  }
  get alt() {
    return this.getAttribute("alt") ?? "";
  }
  syncStateFromSource() {
    this.state = this.src ? "loading" : "empty";
  }
  handleLoad = () => {
    this.state = "loaded";
    this.render();
  };
  handleError = () => {
    this.state = "error";
    reportError("Image preview failed to load", { src: this.src });
    this.render();
  };
  render() {
    const src = this.src;
    const alt = this.alt;
    let body = '<div class="image-preview__message">No image selected.</div>';
    if (src) {
      const loading = this.state === "loading" ? '<div class="image-preview__loading"><span class="image-preview__message">Loading...</span></div>' : "";
      const error = this.state === "error" ? '<div class="image-preview__message image-preview__message--error">Could not load this image.</div>' : "";
      body = `
        <div class="image-preview__frame">
          ${this.state === "error" ? error : `<img class="image-preview__image" src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" />${loading}`}
        </div>`;
    }
    this.root.innerHTML = `
      <style>${previewStyles}</style>
      <div class="image-preview" part="container">${body}</div>
    `;
    const img = this.root.querySelector("img");
    img?.addEventListener("load", this.handleLoad, { once: true });
    img?.addEventListener("error", this.handleError, { once: true });
  }
};
function escapeAttribute(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
if (!customElements.get("image-preview")) {
  customElements.define("image-preview", ImagePreview);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ImagePreview,
  setErrorHandler
});
//# sourceMappingURL=index.cjs.map