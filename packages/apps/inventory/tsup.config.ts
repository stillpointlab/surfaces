import { formatPackage } from '../../../tooling/tsup';

// One entry: the DOM-free core. `./element` is reserved for the app's element.
export default formatPackage({ entry: { index: 'src/index.ts' } });
