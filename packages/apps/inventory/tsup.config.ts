import { formatPackage } from '../../../tooling/tsup';

// Two entries, both DOM-free. `.` is the core. `./paths` is the naming rules
// and creation defaults alone, for a client that needs them without the core:
// the manifest's zod schemas are built at module scope, so a bundler cannot
// shake them out of `.`. `./element` is reserved for the app's element.
export default formatPackage({ entry: { index: 'src/index.ts', paths: 'src/paths.ts' } });
