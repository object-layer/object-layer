'use strict';

import LocalStore from './local';
import RemoteStore from './remote';

export class Store {
  constructor(options = {}) {
    let url = options.url;
    if (!url) throw new Error('url parameter is missing');
    let pos = url.indexOf(':');
    if (pos === -1) throw new Error('Invalid url');
    let protocol = url.substr(0, pos);
    switch (protocol) {
      case 'mysql':
      case 'websql':
      case 'sqlite':
        return new LocalStore(options);
      case 'http':
      case 'https':
        return new RemoteStore(options);
      default:
        throw new Error('Unknown protocol');
    }
  }
}

export default Store;
