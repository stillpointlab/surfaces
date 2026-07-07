import type { XmdlConditionalReference, XmdlParseError, XmdlPlaceholderReference } from './types';

const TEMPLATE_TOKEN_PATTERN = /{{\s*([^{}]+?)\s*}}/g;
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface ConditionalFrame {
  name: string;
  start: number;
  bodyStart: number;
}

export interface ParsedBodyReferences {
  placeholders: XmdlPlaceholderReference[];
  conditionals: XmdlConditionalReference[];
  errors: XmdlParseError[];
}

export function isValidIdentifier(value: string): boolean {
  return IDENTIFIER_PATTERN.test(value);
}

export function parseBodyReferences(body: string, paramNames: Set<string>): ParsedBodyReferences {
  const placeholders: XmdlPlaceholderReference[] = [];
  const conditionals: XmdlConditionalReference[] = [];
  const errors: XmdlParseError[] = [];
  const stack: ConditionalFrame[] = [];

  for (const match of body.matchAll(TEMPLATE_TOKEN_PATTERN)) {
    const token = match[0];
    const expression = match[1].trim();
    const start = match.index ?? 0;
    const end = start + token.length;

    if (expression.startsWith('#if ')) {
      const name = expression.slice(4).trim();
      validateBodyReference(name, paramNames, errors, start, 'conditional');
      stack.push({ name, start, bodyStart: end });
      continue;
    }

    if (expression === '/if') {
      const open = stack.pop();
      if (!open) {
        errors.push({
          code: 'xmdl.body.unmatchedConditionalClose',
          message: 'Found {{/if}} without a matching {{#if paramName}}.',
          path: `body@${start}`,
        });
        continue;
      }
      conditionals.push({
        name: open.name,
        start: open.start,
        end,
        bodyStart: open.bodyStart,
        bodyEnd: start,
      });
      continue;
    }

    if (expression.startsWith('#') || expression.startsWith('/')) {
      errors.push({
        code: 'xmdl.body.unsupportedSyntax',
        message: `Unsupported template expression "{{${expression}}}".`,
        path: `body@${start}`,
      });
      continue;
    }

    if (!validateBodyReference(expression, paramNames, errors, start, 'placeholder')) {
      continue;
    }

    placeholders.push({ name: expression, start, end });
  }

  for (const open of stack.reverse()) {
    errors.push({
      code: 'xmdl.body.unclosedConditional',
      message: `Conditional "{{#if ${open.name}}}" is missing a closing "{{/if}}".`,
      path: `body@${open.start}`,
    });
  }

  return { placeholders, conditionals, errors };
}

function validateBodyReference(
  name: string,
  paramNames: Set<string>,
  errors: XmdlParseError[],
  start: number,
  kind: 'placeholder' | 'conditional',
): boolean {
  if (!isValidIdentifier(name)) {
    errors.push({
      code: 'xmdl.body.invalidReference',
      message: `Invalid ${kind} reference "${name}". References must be declared param identifiers.`,
      path: `body@${start}`,
    });
    return false;
  }

  if (!paramNames.has(name)) {
    errors.push({
      code: 'xmdl.body.undeclaredReference',
      message: `Template body references undeclared param "${name}".`,
      path: `body@${start}`,
    });
    return false;
  }

  return true;
}
