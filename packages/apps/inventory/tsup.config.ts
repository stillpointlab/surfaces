import { formatPackage } from '../../../tooling/tsup';

// Four entries. `.` is the DOM-free core. `./types` (the shared types) and
// `./paths` (the naming rules and creation defaults) import nothing, for a
// client that needs them without the core: the manifest's zod schemas are built
// at module scope, so a bundler cannot shake them out of `.`. `./element` is
// `<spl-inventory-overview>` and `<spl-inventory-zone>`; it imports `./types`
// and `./paths`, never the core.
export default formatPackage({
  entry: {
    index: 'src/index.ts',
    types: 'src/types.ts',
    paths: 'src/paths.ts',
    element: 'src/element/index.ts',
  },
});
