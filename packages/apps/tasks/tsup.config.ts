import { formatPackage } from '../../../tooling/tsup';

// Eight entries. `.` is the DOM-free core. `./types` (the tasks types and their
// constants) and `./paths` (the naming rules) import nothing, for a client that
// needs them without the core: the manifest's zod schemas are built at module
// scope, so a bundler cannot shake them out of `.`. `./meta` (the app's name,
// icon and create copy) imports `./paths` alone, for the same reason.
// `./create` is the create form's checks, which the core's plan runs too; it
// imports `./paths` and `./types`. `./element` is `<spl-task-board>` and
// `<spl-tasks-nav>`, and `./create-element` is `<spl-tasks-create>`, kept apart
// so a page that only shows a board does not load the form. They import
// `./types`, `./paths` and `./create`, never the core. `./shell` is
// `<spl-tasks-app>`, the page around the board and the strip, which it
// registers too; it adds the module's page paths (`pages.ts`, no zod) to what
// they import.
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
