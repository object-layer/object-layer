'use strict';

import { clone } from 'better-clone';
import idgen from 'idgen';
import { TopModel } from 'top-model';
import Relation from './relation';

export class Model extends TopModel {
  static getSelfAndSuperclasses() {
    let classes = [];
    let currentClass = this;
    while (currentClass !== Model) {
      classes.push(currentClass);
      currentClass = Object.getPrototypeOf(currentClass);
    }
    return classes;
  }

  static getSelfAndSuperclassesWithPrimaryKeyField() {
    let classes = [];
    let selfAndSuperclasses = this.getSelfAndSuperclasses();
    for (let selfOrSuperclass of selfAndSuperclasses) {
      if (!selfOrSuperclass.prototype.primaryKeyField) break;
      classes.push(selfOrSuperclass);
    }
    return classes;
  }

  static getClassNames() {
    let classNames = [];
    let classes = this.getSelfAndSuperclassesWithPrimaryKeyField();
    for (let klass of classes) {
      let name = klass.getName();
      if (name.startsWith('_')) continue;
      if (classNames.includes(name)) continue;
      classNames.push(name);
    }
    return classNames;
  }

  constructor(json, options) {
    let id;
    if (typeof json === 'number' || typeof json === 'string') {
      id = json;
      json = {};
    }
    super(json, options);
    if (id) this.primaryKeyValue = id;
    let origin = this.constructor._origin;
    if (origin) {
      this[origin.relation.foreignKey] = origin.item.primaryKeyValue;
    }
  }

  clone() {
    return this.constructor.unserialize(this.serialize());
  }

  get context() {
    return this.constructor.store.context;
  }

  // === Model operations ===

  static async get(item, options = {}) {
    item = this.normalizeItem(item);
    if (!item.primaryKeyValue && item._origin && item._origin.relation.type === 'HAS_ONE') {
      let query = {};
      query[item._origin.relation.foreignKey] = item._origin.item.primaryKeyValue;
      let items = await this.store.find(this, { query, limit: 1 });
      if (items[0]) {
        item.mutate(items[0]);
      } else {
        if (options.errorIfMissing !== false) throw new Error('Item not found');
        item = undefined;
      }
    } else {
      item = await this.store.get(item, options);
    }
    if (item) item.saved = item.clone();
    return item;
  }

  static async put(item, options = {}) {
    item = this.normalizeItem(item);
    try {
      item.isSaving = true;
      await item.transaction(async function(savingItem) {
        await savingItem.emit('willSave', options);
        if (options.validate !== false) savingItem.validate();
        await savingItem.constructor.store.put(savingItem, options);
      });
      item.saved = item.clone();
      await item.emit('didSave', options);
      if (this.store.log) {
        this.store.log.trace(item.constructor.getName() + '#' + item.primaryKeyValue + ' saved to ' + (this.store.isLocal ? 'local' : 'remote') + ' store');
      }
    } finally {
      item.isSaving = false;
    }
    return item;
  }

  static async delete(item, options = {}) {
    item = this.normalizeItem(item);
    if (!item.primaryKeyValue && item._origin && item._origin.relation.type === 'HAS_ONE') {
      await item.load();
    }
    let hasBeenDeleted;
    try {
      item.isDeleting = true;
      await item.transaction(async function(deletingItem) {
        await deletingItem.emit('willDelete', options);
        hasBeenDeleted = await deletingItem.constructor.store.delete(deletingItem, options);
        deletingItem.saved = undefined;
      });
      if (hasBeenDeleted) {
        await item.emit('didDelete', options);
        if (this.store.log) {
          this.store.log.trace(item.constructor.getName() + '#' + item.primaryKeyValue + ' deleted from ' + (this.store.isLocal ? 'local' : 'remote') + ' store');
        }
      }
    } finally {
      item.isDeleting = false;
    }
    return hasBeenDeleted;
  }

  static async getMany(items, options = {}) {
    if (!Array.isArray(items)) {
      throw new Error('Invalid \'items\' parameter (should be an array)');
    }
    items = items.map(this.normalizeItem.bind(this));
    items = await this.store.getMany(items, options);
    for (let item of items) item.saved = item.clone();
    return items;
  }

  static async find(options = {}) {
    options = this.injectOriginToQuery(options);
    let items = await this.store.find(this, options);
    for (let item of items) {
      item.saved = item.clone();
      this.propagateOriginToItem(item);
    }
    return items;
  }

  static async count(options = {}) {
    options = this.injectOriginToQuery(options);
    return await this.store.count(this, options);
  }

  static async forEach(options = {}, fn, thisArg) {
    options = this.injectOriginToQuery(options);
    await this.store.forEach(this, options, async function(item) {
      item.saved = item.clone();
      this.propagateOriginToItem(item);
      await fn.call(thisArg, item);
    }, this);
  }

  static async findAndDelete(options = {}) {
    options = this.injectOriginToQuery(options);
    // FIXME: 'willDelete' and 'didDelete' event should be emitted for each items
    return await this.store.findAndDelete(this, options);
  }

  static async callModel(method, options = {}, body) {
    options = this.injectOriginToQuery(options);
    return await this.store.call(this, undefined, method, options, body);
  }

  static async callItem(item, method, options = {}, body) {
    item = this.normalizeItem(item);
    return await this.store.call(this, item, method, options, body);
  }

  static async transaction(fn) {
    if (this.insideTransaction) return await fn(this);
    return await this.store.transaction(async function(transactionStore) {
      let transactionModel = transactionStore[this.getName()];
      if (this._origin) transactionModel._origin = this._origin;
      return await fn(transactionModel);
    }.bind(this));
  }

  static get insideTransaction() {
    return this.store.insideTransaction;
  }

  static makeURL(method, options) {
    return this.store.makeURL(this, undefined, method, options);
  }

  static propagateOriginToItem(item) {
    if (this._origin) item._origin = this._origin;
  }

  static injectOriginToQuery(options) {
    let origin = this._origin;
    if (origin) {
      options = clone(options);
      if (!options.query) options.query = {};
      options.query[origin.relation.foreignKey] = origin.item.primaryKeyValue;
    }
    return options;
  }

  static normalizeItem(item) {
    if (!item) throw new Error('key or item parameter is empty');
    if (!(item instanceof this)) {
      item = this.unserialize(item);
    }
    return item;
  }

  // === Field definitions ===

  get primaryKeyName() {
    if (!this.primaryKeyField) {
      throw new Error('Primary key field is missing');
    }
    return this.primaryKeyField.name;
  }

  get primaryKeyValue() {
    return this[this.primaryKeyName];
  }
  set primaryKeyValue(val) {
    this[this.primaryKeyName] = val;
  }

  definePrimaryKeyField(name = 'id', type, options = {}, decoratorDescriptor) {
    if (!options.hasOwnProperty('isAuto')) options.isAuto = true;
    let field = this.defineKeyField(name, type, options, decoratorDescriptor);
    this.primaryKeyField = field;
  }

  defineForeignKeyField(name, type, options = {}, decoratorDescriptor) {
    this.defineKeyField(name, type, options, decoratorDescriptor);
  }

  defineKeyField(name, type = String, options = {}, decoratorDescriptor) {
    if (!(typeof name === 'string' && name)) throw new Error('name parameter is missing');
    let fieldOptions = {};
    if (options.defaultValue) fieldOptions.defaultValue = options.defaultValue;
    let field = this.defineField(name, type, fieldOptions, decoratorDescriptor);
    if (options.max) field.maxKeyValue = options.max;
    if (options.isAuto) {
      this.on('willSave', function() {
        if (this.constructor.store.isLocal) {
          this.generateKeyValue(field);
        }
      });
    }
    return field;
  }

  generateKeyValue(field) {
    if (typeof field === 'string') field = this.getField(field);
    if (!field) throw new Error('Unknown field');
    if (this[field.name]) return; // a value has already been generated
    let val;
    if (field.type === String) {
      val = idgen(16);
    } else if (field.type === Number) {
      let max = field.maxKeyValue || 2000000000;
      val = Math.floor(Math.random() * max) + 1;
    } else {
      throw new Error('Unsupported key type');
    }
    this[field.name] = val;
  }

  generatePrimaryKeyValue() {
    this.generateKeyValue(this.primaryKeyField);
  }

  defineCreatedOnField(name = 'createdOn', decoratorDescriptor) {
    let field = this.defineField(name, Date, undefined, decoratorDescriptor);
    this.on('willSave', function() {
      if (this.constructor.store.isLocal) {
        if (!this[name]) this[name] = new Date();
      }
    });
    return field;
  }

  defineUpdatedOnField(name = 'updatedOn', decoratorDescriptor) {
    let field = this.defineField(name, Date, undefined, decoratorDescriptor);
    this.on('willSave', function(options) {
      if (!this.constructor.store.isLocal) return;
      if (options.source === 'computer' || options.source === 'localSynchronizer' || options.source === 'remoteSynchronizer' || options.source === 'archive') return;
      this[name] = new Date();
    });
    return field;
  }

  // === Relation definitions ===

  getRelation(name) {
    return this._relations && this._relations[name];
  }

  setRelation(name, definition) {
    let relation = new Relation(name, definition);
    if (!this.hasOwnProperty('_relations')) {
      this._relations = Object.create(this._relations || null);
    }
    this._relations[name] = relation;
    return relation;
  }

  forEachRelation(fn, thisArg) {
    for (let name in this._relations) {
      let field = this._relations[name];
      fn.call(thisArg, field, name);
    }
  }

  defineHasOneRelation(name, className, foreignKey, decoratorDescriptor) {
    let relation = this.setRelation(name, {
      type: 'HAS_ONE',
      className,
      foreignKey
    });

    let descriptor;
    if (decoratorDescriptor) {
      delete decoratorDescriptor.initializer; // TODO: check if this is still required
      descriptor = decoratorDescriptor;
    } else {
      descriptor = {};
    }
    descriptor.get = function() {
      if (!this.hasOwnProperty('_relationsCache')) this._relationsCache = {};
      let item = this._relationsCache[name];
      if (!item) {
        if (this._origin && this._origin.relation.foreignKey === foreignKey) {
          item = this._origin.item;
        } else {
          let model = this.constructor.store[className];
          item = new model();
          item[foreignKey] = this.primaryKeyValue;
          item._origin = {
            relation,
            item: this
          };
        }
        this._relationsCache[name] = item;
      }
      return item;
    };
    if (!decoratorDescriptor) {
      Object.defineProperty(this, name, descriptor);
    }

    this.on('willDelete', async function() {
      if (this.constructor.store.isLocal) {
        await this[name].delete({ source: 'computer' });
      }
    });
  }

  defineHasManyRelation(name, className, foreignKey, decoratorDescriptor) {
    let relation = this.setRelation(name, {
      type: 'HAS_MANY',
      className,
      foreignKey
    });

    let descriptor;
    if (decoratorDescriptor) {
      delete decoratorDescriptor.initializer; // TODO: check if this is still required
      descriptor = decoratorDescriptor;
    } else {
      descriptor = {};
    }
    descriptor.get = function() {
      if (!this.hasOwnProperty('_relationsCache')) this._relationsCache = {};
      let model = this._relationsCache[name];
      if (!model) {
        model = this.constructor.store.getModel(className, this);
        model._origin = {
          relation,
          item: this
        };
        this._relationsCache[name] = model;
      }
      return model;
    };
    if (!decoratorDescriptor) {
      Object.defineProperty(this, name, descriptor);
    }

    this.on('willDelete', async function() {
      if (this.constructor.store.isLocal) {
        let items = await this[name].find();
        for (let item of items) await item.delete({ source: 'computer' });
      }
    });
  }

  defineBelongsToRelation(name, className, foreignKey, decoratorDescriptor) {
    let relation = this.setRelation(name, {
      type: 'BELONGS_TO',
      className,
      foreignKey
    });

    let descriptor;
    if (decoratorDescriptor) {
      delete decoratorDescriptor.initializer; // TODO: check if this is still required
      descriptor = decoratorDescriptor;
    } else {
      descriptor = {};
    }
    descriptor.get = function() {
      if (!this.hasOwnProperty('_relationsCache')) this._relationsCache = {};
      let item = this._relationsCache[name];
      if (!item) {
        if (this._origin && this._origin.relation.foreignKey === foreignKey) {
          item = this._origin.item;
        } else {
          let model = this.constructor.store[className];
          item = new model(this[foreignKey]);
          item._origin = {
            relation,
            item: this
          };
        }
        this._relationsCache[name] = item;
      }
      return item;
    };
    if (!decoratorDescriptor) {
      Object.defineProperty(this, name, descriptor);
    }
  }

  // === Item status ===

  get isNew() {
    return this.saved == null;
  }

  get isModified() {
    return !this.isEqualTo(this.saved);
  }

  // === Item operations ===

  async load(options = {}) {
    await this.constructor.get(this, options);
  }

  async save(options) {
    await this.constructor.put(this, options);
  }

  async delete(options) {
    return await this.constructor.delete(this, options);
  }

  async call(method, options, body) {
    return await this.constructor.callItem(this, method, options, body);
  }

  async transaction(fn) {
    if (this.insideTransaction) return await fn(this);
    let transactionItem;
    let result = await this.constructor.transaction(async function(transactionModel) {
      transactionItem = transactionModel.unserialize(this);
      transactionItem.saved = this.saved;
      return await fn(transactionItem);
    }.bind(this));
    this.replaceValue(transactionItem);
    this.saved = transactionItem.saved;
    return result;
  }

  get insideTransaction() {
    return this.constructor.insideTransaction;
  }

  makeURL(method, options) {
    return this.constructor.store.makeURL(
      this.constructor, this, method, options
    );
  }
}

// === Decorators ===

export function primaryKey(type, options) {
  return function(target, name, descriptor) {
    Model.prototype.definePrimaryKeyField.call(target, name, type, options, descriptor);
  };
}

export function foreignKey(type, options) {
  return function(target, name, descriptor) {
    Model.prototype.defineForeignKeyField.call(target, name, type, options, descriptor);
  };
}

export function createdOn() {
  return function(target, name, descriptor) {
    Model.prototype.defineCreatedOnField.call(target, name, descriptor);
  };
}

export function updatedOn() {
  return function(target, name, descriptor) {
    Model.prototype.defineUpdatedOnField.call(target, name, descriptor);
  };
}

export function hasOne(className, foreignKey) {
  return function(target, name, descriptor) {
    Model.prototype.defineHasOneRelation.call(target, name, className, foreignKey, descriptor);
  };
}

export function hasMany(className, foreignKey) {
  return function(target, name, descriptor) {
    Model.prototype.defineHasManyRelation.call(target, name, className, foreignKey, descriptor);
  };
}

export function belongsTo(className, foreignKey) {
  return function(target, name, descriptor) {
    Model.prototype.defineBelongsToRelation.call(target, name, className, foreignKey, descriptor);
  };
}

export { field, on } from 'top-model';

export default Model;
