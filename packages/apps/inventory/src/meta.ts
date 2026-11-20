/**
 * What a host shows for the inventory before one is open (the app contract's
 * `AppMeta`): its name and icon in the host's tree, and the create form's copy.
 * The `./meta` entry: it imports `./paths` alone, so a host page that lists the
 * apps loads none of the core (and no zod).
 */
import { INVENTORY_DEFAULT_FOLDER } from './paths.js';

import type { AppMeta } from '@stillpointlab/common-format/app';

export const inventoryMeta: AppMeta = {
  label: 'Inventory',
  icon: 'inventory',
  create: {
    noun: 'an inventory',
    subject: 'Inventory',
    defaultFolder: INVENTORY_DEFAULT_FOLDER,
    folderExample: '“inventory” or “home/inventory”',
    folderHelp:
      'Where the files live in the repository. Choose a folder so this repository can hold other app views beside the inventory.',
  },
};
