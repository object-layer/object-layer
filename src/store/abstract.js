'use strict';

import { clone } from 'better-clone';
import { EventEmitterMixin } from 'event-emitter-mixin';

export class AbstractStore extends EventEmitterMixin() {
  constructor(options = {}) {
    super();

    if (!options.name) throw new Error('Store name is missing');
    if (!options.url) throw new Error('Store URL is missing');
    if (!Array.isArray(options.collections)) throw new Error('Store collections parameter is invalid');

    this.context = options.context;
    this.name = options.name;
    this.log = options.log || (this.context && this.context.log);

    this.collectionDefinitions = {};
    this._collectionClassNamesByItemClassName = {};
    for (let definition of options.collections) {
      definition = this.normalizeCollectionDefinition(definition);
      let collectionClass = definition.collectionClass;
      let collectionClassName = collectionClass.name;
      this.collectionDefinitions[collectionClassName] = definition;
      let itemClassName = collectionClass.Item.name;
      this._collectionClassNamesByItemClassName[itemClassName] = collectionClassName;
    }

    this.root = this;
  }

  use(plugin) {
    plugin.plug(this);
  }

  createCollection(name, cache) {
    if (cache && name in cache) return cache[name];
    let definition = this.collectionDefinitions[name];
    if (!definition) {
      throw new Error(`Collection class '${name}' not found`);
    }
    let collection = new (definition.collectionClass)(this);
    if (cache) cache[name] = collection;
    return collection;
  }

  createCollectionFromItemClassName(name, cache) {
    let collectionClassName = this._collectionClassNamesByItemClassName[name];
    if (!collectionClassName) {
      throw new Error(`Item class '${name}' not found`);
    }
    return this.createCollection(collectionClassName, cache);
  }

  getRootCollectionClass() {
    if (this._rootCollectionClass) return this._rootCollectionClass;
    let rootCollectionClass;
    for (let collectionClassName of Object.keys(this.collectionDefinitions)) {
      let definition = this.collectionDefinitions[collectionClassName];
      let collectionClass = definition.collectionClass;
      let itemClassNames = collectionClass.Item.getClassNames();
      if (itemClassNames.length === 1) { // TODO: find out a cleaner way
        if (rootCollectionClass) {
          throw new Error('More than one root collection class found');
        }
        rootCollectionClass = collectionClass;
      }
    }
    if (!rootCollectionClass) {
      throw new Error('Root collection class not found');
    }
    this.root._rootCollectionClass = rootCollectionClass;
    return rootCollectionClass;
  }

  createRootCollection() {
    return new (this.rootCollectionClass)(this);
  }

  normalizeCollectionDefinition(definition) {
    if (typeof definition === 'function') {
      definition = { collectionClass: definition };
    } else {
      definition = clone(definition);
    }
    if (definition.class) {
      definition.collectionClass = definition.class;
      delete definition.class;
    }
    return definition;
  }
}

export default AbstractStore;
