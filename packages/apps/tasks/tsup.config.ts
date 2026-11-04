import { formatPackage } from '../../../tooling/tsup';

// Three entries, all DOM-free. `.` is the core. `./types` (the tasks types and
// their constants) and `./paths` (the naming rules) import nothing, for a
// client that needs them without the core: the manifest's zod schemas are built
// at module scope, so a bundler cannot shake them out of `.`. `./element` is
// reserved for the app's element.
export default formatPackage({
  entry: { index: 'src/index.ts', types: 'src/types.ts', paths: 'src/paths.ts' },
});
