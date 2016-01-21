'use strict';

import { clone } from 'better-clone';
import { Item } from './item';

export class Collection {
  static Item = Item;

  constructor(store) {
    this.store = store;
  }

  get name() {
    return this.constructor.name;
  }

  get Item() {
    return this.constructor.Item;
  }

  get context() {
    return this.store.context;
  }

  create(json) {
    return this._createOrUnserialize(json, 'create');
  }

  unserialize(json) {
    return this._createOrUnserialize(json, 'unserialize');
  }

  _createOrUnserialize(json, mode) {
    if (typeof json === 'number' || typeof json === 'string') {
      let value = json;
      json = {};
      let itemProto = this.Item.prototype;
      json[itemProto.primaryKeyName] = value;
    }
    let item;
    if (mode === 'create') item = new (this.Item)(json);
    else item = this.Item.unserialize(json);
    item.collection = this;
    if (this.fixedForeignKey) {
      item[this.fixedForeignKey.name] = this.fixedForeignKey.value;
    }
    return item;
  }

  async get(item, options) {
    item = this.normalizeItem(item);
    options = this.normalizeOptions(options);
    item = await this.store.get(item, options);
    if (item) {
      item.isNew = false;
      item.isModified = false;
    }
    return item;
  }

  async put(item, options) {
    item = this.normalizeItem(item);
    options = this.normalizeOptions(options);
    let validate = options.validate != null ? options.validate : true;
    try {
      item.isSaving = true;
      await item.transaction(async function(savingItem) {
        await savingItem.emit('willSave', options);
        if (validate) savingItem.validate();
        await savingItem.store.put(savingItem, options);
      });
      item.isNew = false;
      item.isModified = false;
      await item.emit('didSave', options);
      if (this.store.log) {
        this.store.log.debug(item.constructor.name + '#' + item.primaryKeyValue + ' saved to ' + (this.store.isLocal ? 'local' : 'remote') + ' store');
      }
    } finally {
      item.isSaving = false;
    }
    return item;
  }

  async delete(item, options) {
    item = this.normalizeItem(item);
    options = this.normalizeOptions(options);
    let hasBeenDeleted;
    try {
      item.isDeleting = true;
      await item.transaction(async function(deletingItem) {
        await deletingItem.emit('willDelete', options);
        hasBeenDeleted = await deletingItem.store.delete(deletingItem, options);
      });
      if (hasBeenDeleted) {
        await item.emit('didDelete', options);
        if (this.store.log) {
          this.store.log.debug(item.constructor.name + '#' + item.primaryKeyValue + ' deleted from ' + (this.store.isLocal ? 'local' : 'remote') + ' store');
        }
      }
    } finally {
      item.isDeleting = false;
    }
    return hasBeenDeleted;
  }

  async getMany(items, options) {
    if (!Array.isArray(items)) {
      throw new Error('Invalid \'items\' parameter (should be an array)');
    }
    items = items.map(this.normalizeItem.bind(this));
    options = this.normalizeOptions(options);
    items = await this.store.getMany(items, options);
    for (let item of items) {
      item.isNew = false;
      item.isModified = false;
    }
    return items;
  }

  async find(options) {
    options = this.normalizeOptions(options);
    options = this.injectFixedForeignKey(options);
    let items = await this.store.find(this, options);
    for (let item of items) {
      item.isNew = false;
      item.isModified = false;
    }
    return items;
  }

  async count(options) {
    options = this.normalizeOptions(options);
    options = this.injectFixedForeignKey(options);
    return await this.store.count(this, options);
  }

  async forEach(options, fn, thisArg) {
    options = this.normalizeOptions(options);
    options = this.injectFixedForeignKey(options);
    await this.store.forEach(this, options, async function(item) {
      item.isNew = false;
      item.isModified = false;
      await fn.call(this, item);
    }, thisArg);
  }

  async findAndDelete(options) {
    options = this.normalizeOptions(options);
    options = this.injectFixedForeignKey(options);
    // FIXME: 'willDelete' and 'didDelete' event should be emitted for each items
    return await this.store.findAndDelete(this, options);
  }

  async call(method, options, body) {
    return await this.callCollection(method, options, body);
  }

  async callCollection(method, options, body) {
    options = this.normalizeOptions(options);
    options = this.injectFixedForeignKey(options);
    return await this.store.call(this, undefined, method, options, body);
  }

  async callItem(item, method, options, body) {
    item = this.normalizeItem(item);
    options = this.normalizeOptions(options);
    return await this.store.call(this, item, method, options, body);
  }

  async transaction(fn) {
    if (this.insideTransaction) return await fn(this);
    return await this.store.transaction(async function(transactionStore) {
      let transactionCollection = transactionStore.createCollection(this.constructor.name);
      if (this.fixedForeignKey) {
        transactionCollection.fixedForeignKey = this.fixedForeignKey;
      }
      return await fn(transactionCollection);
    }.bind(this));
  }

  get insideTransaction() {
    return this.store.insideTransaction;
  }

  makeURL(method, options) {
    return this.store.makeURL(this, undefined, method, options);
  }

  injectFixedForeignKey(options) {
    if (this.fixedForeignKey) {
      options = clone(options);
      if (!options.query) options.query = {};
      options.query[this.fixedForeignKey.name] = this.fixedForeignKey.value;
    }
    return options;
  }

  normalizeItem(item) {
    if (!item) throw new Error('key or item parameter is empty');
    if (!(item instanceof this.Item)) {
      item = this.unserialize(item);
    }
    return item;
  }

  normalizeOptions(options) {
    if (!options) options = {};
    return options;
  }
}

export default Collection;
