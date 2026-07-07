declare class ImagePreview extends HTMLElement {
    private readonly root;
    private state;
    static get observedAttributes(): string[];
    constructor();
    connectedCallback(): void;
    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void;
    setSource(src: string, alt?: string): void;
    private get src();
    private get alt();
    private syncStateFromSource;
    private handleLoad;
    private handleError;
    private render;
}

type ErrorHandler = (message: string, error?: unknown) => void;
declare function setErrorHandler(handler: ErrorHandler | null): void;

export { ImagePreview, setErrorHandler };
