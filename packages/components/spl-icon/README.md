# @stillpointlab/spl-icon-component

The `<spl-icon>` element: an icon button drawing one glyph from a fixed set, as a mask over
`currentColor`, so it takes its colour from its surroundings.

```ts
import '@stillpointlab/spl-icon-component';
```

```html
<spl-icon icon-name="gear" aria-label="Settings" data-size="small" data-padding="none"></spl-icon>
```

## Attributes

| Attribute      | Values                             | Default  |
| -------------- | ---------------------------------- | -------- |
| `icon-name`    | one of the icons below             |          |
| `aria-label`   | the accessible name                |          |
| `data-size`    | `small` (16px), `large` (32px)     | 24px     |
| `data-padding` | `none`, `small`, `medium`, `large` | `medium` |

## Icons

`dots-vertical`, `back-arrow`, `edit-pencil`, `gear`, `profile`, `ai-model`, `plus-circle`, `trash`, `logout`, `more-horizontal`, `close`, `task`, `inventory`, `folder`, `document`, `copy`, `download`, `mail`, `bold`, `italic`, `strikethrough`, `code`, `code-block`, `quote`, `list-bulleted`, `list-numbered`, `link`, `table`, `chevron-down`, `arrow-up`, `arrow-down`, `arrow-left`, `arrow-right`.

An unknown name has no mask, so the element draws a filled square.

## Slots, events and tokens

None. It renders `role="button"` and `tabindex="0"`, and clicks reach the host as ordinary click
events.

Its attributes reach the shadow DOM as attributes, never as markup, so a label can carry any text
(Context Manager's conversation indicator passes provider and model names an admin typed).
