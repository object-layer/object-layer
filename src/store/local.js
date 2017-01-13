'use strict';

import { clone } from 'better-clone';
import idgen from 'idgen';
import setImmediatePromise from 'set-immediate-promise';
import InstanceStore from 'instance-store';
import Store from './';

const VERSION = 2;
const RESPIRATION_RATE = 250;

export class LocalStore extends Store {
  isLocal = true; // TODO: improve this

  constructor(options = {}) {
    super(options);

    const classes = [];
    this.forEachModelRegistration(function(registration) {
      classes.push({
        name: registration.model.getName(),
        indexes: registration.indexes
      });
    });

    this.instanceStore = new InstanceStore({
      name: this.name,
      url: this.url,
      classes,
      log: this.log
    });

    this.instanceStore.on('willUpgrade', () => this.emit('willUpgrade'));
    this.instanceStore.on('didUpgrade', () => this.emit('didUpgrade'));
    this.instanceStore.on('willMigrate', () => this.emit('willMigrate'));
    this.instanceStore.on('didMigrate', () => this.emit('didMigrate'));
  }

  get keyValueStore() {
    return this.instanceStore.store;
  }

  async initializeStore() {
    if (this.hasBeenInitialized) return;
    if (this.isInitializing) return;
    if (this.insideTransaction) {
      throw new Error('Cannot initialize the store inside a transaction');
    }
    this.isInitializing = true;
    try {
      await this.instanceStore.initializeInstanceStore();
      const hasBeenCreated = await this.createStoreIfDoesNotExist();
      if (!hasBeenCreated) {
        await this.instanceStore.documentStore.lockDocumentStore();
        try {
          await this.upgradeStore();
        } finally {
          await this.instanceStore.documentStore.unlockDocumentStore();
        }
      }
      this.hasBeenInitialized = true;
      await this.emit('didInitialize');
    } finally {
      this.isInitializing = false;
    }
  }

  async _loadStoreRecord(keyValueStoreTransaction = this.keyValueStore, errorIfMissing = true) {
    await this.initializeStore();
    return await keyValueStoreTransaction.get(
      [this.name, '$Store'],
      { errorIfMissing }
    );
  }

  async _saveStoreRecord(record, keyValueStoreTransaction = this.keyValueStore, errorIfExists) {
    await keyValueStoreTransaction.put(
      [this.name, '$Store'],
      record,
      { errorIfExists, createIfMissing: !errorIfExists }
    );
  }

  async createStoreIfDoesNotExist() {
    let hasBeenCreated = false;
    await this.keyValueStore.transaction(async function(keyValueStoreTransaction) {
      let record = await this._loadStoreRecord(keyValueStoreTransaction, false);
      if (!record) {
        record = {
          name: this.name,
          version: VERSION,
          id: idgen(16)
        };
        await this._saveStoreRecord(record, keyValueStoreTransaction, true);
        hasBeenCreated = true;
        await this.emit('didCreate');
        if (this.log) {
          this.log.info(`Store '${this.name}' created`);
        }
      }
    }.bind(this));
    return hasBeenCreated;
  }

  async upgradeStore() {
    const record = await this._loadStoreRecord();
    const version = record.version;

    if (version === VERSION) return;

    if (version > VERSION) {
      throw new Error('Cannot downgrade the store');
    }

    this.emit('upgradeDidStart');

    if (version < 2) {
      throw new Error('Cannot upgrade the store to version 2');
    }

    record.version = VERSION;
    await this._saveStoreRecord(record);
    if (this.log) {
      this.log.info(`Store '${this.name}' upgraded to version ${VERSION}`);
    }

    this.emit('upgradeDidStop');
  }

  async getStoreId() {
    if (this._storeId) return this._storeId;
    const record = await this._loadStoreRecord();
    this.root._storeId = record.id;
    return record.id;
  }

  async destroyAll() {
    await this.emit('willDestroy');
    await this.instanceStore.destroyAll();
    this.hasBeenInitialized = false;
    delete this.root._storeId;
    await this.emit('didDestroy');
  }

  async close() {
    await this.instanceStore.close();
  }

  // === Operations ====

  async get(item, options) {
    const className = item.constructor.getName();
    const key = item.primaryKeyValue;
    await this.initializeStore();
    const result = await this.instanceStore.get(className, key, options);
    if (!result) return undefined; // means item is not found and errorIfMissing is false
    const resultClassName = result.classes[0];
    item.mutate(result.instance, this[resultClassName]);
    return item;
  }

  async put(item, options = {}) {
    const classNames = item.constructor.getClassNames();
    const key = item.primaryKeyValue;
    const instance = item.serialize();
    options = clone(options);
    if (item.isNew) options.errorIfExists = true;
    await this.initializeStore();
    await this.instanceStore.put(classNames, key, instance, options);
    await this.emit('didPut', item, options);
  }

  async delete(item, options) {
    const className = item.constructor.getName();
    const key = item.primaryKeyValue;
    await this.initializeStore();
    const hasBeenDeleted = await this.instanceStore.delete(
      className, key, options
    );
    if (hasBeenDeleted) await this.emit('didDelete', item, options);
    return hasBeenDeleted;
  }

  async getMany(items, options) {
    if (!items.length) return [];
    // we suppose that every items belongs to the same model:
    const className = items[0].constructor.getName();
    const keys = items.map(item => item.primaryKeyValue);
    let iterationsCount = 0;
    await this.initializeStore();
    const results = await this.instanceStore.getMany(className, keys, options);
    const finalItems = [];
    for (const result of results) {
      const item = items.find(item => item.primaryKeyValue === result.key);
      if (!item) throw new Error('Found an unexpected item');
      const resultClassName = result.classes[0];
      item.mutate(result.instance, this[resultClassName]);
      finalItems.push(item);
      if (++iterationsCount % RESPIRATION_RATE === 0) await setImmediatePromise();
    }
    return finalItems;
  }

  async find(model, options) {
    const className = model.getName();
    let iterationsCount = 0;
    await this.initializeStore();
    const results = await this.instanceStore.find(className, options);
    const items = [];
    for (const result of results) {
      const resultClassName = result.classes[0];
      const item = this[resultClassName].unserialize(result.instance);
      items.push(item);
      if (++iterationsCount % RESPIRATION_RATE === 0) await setImmediatePromise();
    }
    return items;
  }

  async count(model, options) {
    const className = model.getName();
    await this.initializeStore();
    return await this.instanceStore.count(className, options);
  }

  async forEach(model, options, fn, thisArg) {
    const className = model.getName();
    await this.initializeStore();
    await this.instanceStore.forEach(className, options, async function(result) {
      const resultClassName = result.classes[0];
      const item = this[resultClassName].unserialize(result.instance);
      await fn.call(thisArg, item);
    }, this);
  }

  async findAndDelete(model, options) {
    let deletedItemsCount = 0;
    await this.forEach(model, options, async function(item) {
      const hasBeenDeleted = await item.delete({ errorIfMissing: false });
      if (hasBeenDeleted) deletedItemsCount++;
    }, this);
    return deletedItemsCount;
  }

  // === Transactions ====

  async transaction(fn) {
    if (this.insideTransaction) return await fn(this);
    await this.initializeStore();
    return await this.instanceStore.transaction(async function(instanceStoreTransaction) {
      const transaction = Object.create(this);
      transaction.instanceStore = instanceStoreTransaction;
      return await fn(transaction);
    }.bind(this));
  }

  get insideTransaction() {
    return this !== this.root;
  }
}

export { model } from './';

export default LocalStore;
