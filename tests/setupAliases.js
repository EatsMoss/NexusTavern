import { register } from 'node:module';

register('./aliasLoader.js', import.meta.url);
