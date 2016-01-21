'use strict';

import idgen from 'idgen';
import { TopModel, on } from 'top-model';
import Relation from './relation';

export class Item extends TopModel {
  static getSelfAndSuperclasses() {
    let classes = [];
    let currentClass = this;
    while (currentClass !== Item) {
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
      let name = klass.name;
      if (!classNames.includes(name)) classNames.push(name);
    }
    return classNames;
  }

  clone() {
    return this.collection.unserialize(this.serialize());
  }

  get store() {
    return this.collection.store;
  }

  get context() {
    return this.collection.context;
  }

  // === Basic fields ===

  get primaryKeyName() {
    if (!this.primaryKeyField) {
      throw new Error('Primary key field is missing');
    }
    return this.primaryKeyField.name;
  }

  get primaryKeyValue() {
    if (!this.primaryKeyField) {
      throw new Error('Primary key field is missing');
    }
    return this[this.primaryKeyName];
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
    let field = this.defineField(name, type, undefined, decoratorDescriptor);
    if (options.max) field.maxKeyValue = options.max;
    if (options.isAuto) {
      this.on('willSave', function() {
        if (this.store.isLocal) {
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
      if (this.store.isLocal) {
        if (!this[name]) this[name] = new Date();
      }
    });
    return field;
  }

  defineUpdatedOnField(name = 'updatedOn', decoratorDescriptor) {
    let field = this.defineField(name, Date, undefined, decoratorDescriptor);
    this.on('willSave', function(options) {
      if (!this.store.isLocal) return;
      if (options.source === 'computer' || options.source === 'localSynchronizer' || options.source === 'remoteSynchronizer' || options.source === 'archive') return;
      this[name] = new Date();
    });
    return field;
  }

  // === Relations ===

  getRelation(name) {
    return this._relations && this._relations[name];
  }

  setRelation(name, collectionName, foreignKey, options) {
    let relation = new Relation(name, collectionName, foreignKey, options);
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

  defineHasManyRelation(name, collectionName, foreignKey, options = {}, decoratorDescriptor) {
    options.type = 'HAS_MANY';

    this.setRelation(name, collectionName, foreignKey, options);

    let descriptor;
    if (decoratorDescriptor) {
      delete decoratorDescriptor.initializer; // TODO: check if this is still required
      descriptor = decoratorDescriptor;
    } else {
      descriptor = {};
    }
    descriptor.get = function() {
      if (!this.hasOwnProperty('_relationValues')) this._relationValues = {};
      let val = this._relationValues[name];
      if (!val) {
        val = this.store.createCollection(collectionName);
        this._relationValues[name] = val;
        val.fixedForeignKey = {
          name: foreignKey,
          value: this.primaryKeyValue
        };
      }
      return val;
    };
    if (!decoratorDescriptor) {
      Object.defineProperty(this, name, descriptor);
    }

    this.on('willDelete', async function() {
      if (this.store.isLocal) {
        let items = await this[name].findItems();
        for (let item of items) await item.delete({ source: 'computer' });
      }
    });
  }

  // === Status ===

  get isNew() {
    return !this._isSaved;
  }
  set isNew(val) {
    this._isSaved = !val;
  }

  get isModified() {
    return this._isModified;
  }
  set isModified(val) {
    this._isModified = val;
  }

  @on didChange() {
    this.isModified = true;
  }

  // === Operations ===

  async load(options = {}) {
    let item = await this.collection.get(this, options);
    if (!item && options.errorIfMissing === false) return;
    if (item !== this) {
      throw new Error('Item.prototype.load() returned an item from a different class');
    }
  }

  async save(options) {
    await this.collection.put(this, options);
  }

  async delete(options) {
    return await this.collection.delete(this, options);
  }

  async call(method, options, body) {
    return await this.collection.callItem(this, method, options, body);
  }

  async transaction(fn) {
    if (this.insideTransaction) return await fn(this);
    let transactionItem;
    let result = await this.collection.transaction(async function(transactionCollection) {
      transactionItem = transactionCollection.unserialize(this);
      transactionItem.isNew = this.isNew;
      transactionItem.isModified = this.isModified;
      return await fn(transactionItem);
    }.bind(this));
    this.replaceValue(transactionItem);
    this.isNew = transactionItem.isNew;
    this.isModified = transactionItem.isModified;
    return result;
  }

  get insideTransaction() {
    return this.collection.insideTransaction;
  }

  makeURL(method, options) {
    return this.store.makeURL(
      this.collection, this, method, options
    );
  }
}

// === Decorators ===

export function primaryKey(type, options) {
  return function(target, name, descriptor) {
    Item.prototype.definePrimaryKeyField.call(target, name, type, options, descriptor);
  };
}

export function foreignKey(type, options) {
  return function(target, name, descriptor) {
    Item.prototype.defineForeignKeyField.call(target, name, type, options, descriptor);
  };
}

export function createdOn() {
  return function(target, name, descriptor) {
    Item.prototype.defineCreatedOnField.call(target, name, descriptor);
  };
}

export function updatedOn() {
  return function(target, name, descriptor) {
    Item.prototype.defineUpdatedOnField.call(target, name, descriptor);
  };
}

export function hasMany(collectionName, foreignKey, options) {
  return function(target, name, descriptor) {
    Item.prototype.defineHasManyRelation.call(target, name, collectionName, foreignKey, options, descriptor);
  };
}

export { field, on } from 'top-model';

export default Item;
