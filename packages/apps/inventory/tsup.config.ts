import { splitPackage } from '../../../tooling/tsup';

// Eight entries. `.` is the DOM-free core. `./types` (the shared types) and
// `./paths` (the naming rules and creation defaults) import nothing, for a
// client that needs them without the core: the manifest's zod schemas are built
// at module scope, so a bundler cannot shake them out of `.`. `./meta` (the
// app's name, icon and create copy) imports the default folder alone
// (`defaultFolder.ts`), so a page that lists the apps carries no naming rules
// either. `./create` is the create form's checks, which the core's plan runs
// too; it imports `./paths`.
// `./element` is `<spl-inventory-overview>` and `<spl-inventory-zone>`, and
// `./create-element` is `<spl-inventory-create>`, kept apart so a page that
// only shows an inventory does not load the form. They import `./types`,
// `./paths` and `./create`, never the core. `./shell` is `<spl-inventory-app>`,
// the page around the two elements, which it registers too; it adds the
// module's page paths (`pages.ts`, no zod) to what they import.
//
// The build splits, so `./element` and `./shell` share one copy of the two
// elements and a page that loads both defines them once. Split files go to
// dist/chunks/, which package.json lists in `sideEffects`.
export default splitPackage({
  entry: {
    index: 'src/index.ts',
    types: 'src/types.ts',
    paths: 'src/paths.ts',
    meta: 'src/meta.ts',
    create: 'src/createRules.ts',
    element: 'src/element/index.ts',
    'create-element': 'src/element/create.ts',
    shell: 'src/shell/index.ts',
  },
});
