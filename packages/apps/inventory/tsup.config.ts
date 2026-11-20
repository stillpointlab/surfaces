import { formatPackage } from '../../../tooling/tsup';

// Eight entries. `.` is the DOM-free core. `./types` (the shared types) and
// `./paths` (the naming rules and creation defaults) import nothing, for a
// client that needs them without the core: the manifest's zod schemas are built
// at module scope, so a bundler cannot shake them out of `.`. `./meta` (the
// app's name, icon and create copy) imports `./paths` alone, for the same reason. `./create` is the
// create form's checks, which the core's plan runs too; it imports `./paths`.
// `./element` is `<spl-inventory-overview>` and `<spl-inventory-zone>`, and
// `./create-element` is `<spl-inventory-create>`, kept apart so a page that
// only shows an inventory does not load the form. They import `./types`,
// `./paths` and `./create`, never the core. `./shell` is `<spl-inventory-app>`,
// the page around the two elements, which it registers too; it adds the
// module's page paths (`pages.ts`, no zod) to what they import.
export default formatPackage({
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
