import {ensurePreviewSecret} from './ensure-preview-secret.mjs';
import {preparePreviewStorage} from './prepare-preview-storage.mjs';

// The required football key remains a hard deployment guard.
console.log('COTEGO Preview football secret: '+ensurePreviewSecret());
console.log('COTEGO Preview durable journal: '+preparePreviewStorage());
