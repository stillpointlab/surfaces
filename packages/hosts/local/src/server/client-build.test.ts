// The workspace aliases the page is built and tested with: each entry to its
// source, from its package's tsup entries where they leave the convention.

import { describe, expect, it } from 'vitest';

import { workspaceAliases } from './client-build';

function sourceOf(specifier: string): string | undefined {
  return workspaceAliases().find((alias) => alias.find.test(specifier))?.replacement;
}

describe('the workspace aliases', () => {
  it('maps an app’s create form to the source its tsup config names', () => {
    expect(sourceOf('@stillpointlab/inventory-app/create-element')).toMatch(
      /apps\/inventory\/src\/element\/create\.ts$/
    );
    expect(sourceOf('@stillpointlab/tasks-app/create-element')).toMatch(
      /apps\/tasks\/src\/element\/create\.ts$/
    );
    expect(sourceOf('@stillpointlab/tasks-app/create')).toMatch(
      /apps\/tasks\/src\/createRules\.ts$/
    );
  });

  it('keeps the convention for the entries that follow it', () => {
    expect(sourceOf('@stillpointlab/inventory-app/shell')).toMatch(
      /apps\/inventory\/src\/shell\/index\.ts$/
    );
    expect(sourceOf('@stillpointlab/md-format/preview')).toMatch(
      /formats\/md\/src\/preview\/index\.ts$/
    );
    expect(sourceOf('@stillpointlab/common-format/app')).toMatch(/common\/src\/app\.ts$/);
  });
});
