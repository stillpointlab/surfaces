import { formatPackage } from '../../../tooling/tsup';

// Five entries. `.` is the DOM-free core. `./types` (the tasks types and their
// constants) and `./paths` (the naming rules) import nothing, for a client that
// needs them without the core: the manifest's zod schemas are built at module
// scope, so a bundler cannot shake them out of `.`. `./create` is the create
// form's checks, which the core's plan runs too; it imports `./paths` and
// `./types`. `./element` is `<spl-task-board>`, `<spl-tasks-nav>` and
// `<spl-tasks-create>`; it imports `./types`, `./paths` and `./create`, never
// the core.
export default formatPackage({
  entry: {
    index: 'src/index.ts',
    types: 'src/types.ts',
    paths: 'src/paths.ts',
    create: 'src/createRules.ts',
    element: 'src/element/index.ts',
  },
});
