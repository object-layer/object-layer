'use strict';

const supportedTypes = ['HAS_MANY'];

export class Relation {
  constructor(name, collectionName, foreignKey, options = {}) {
    if (typeof name !== 'string' || !name) {
      throw new Error('name parameter is missing');
    }
    if (!collectionName) {
      throw new Error('collectionName parameter is missing');
    }
    if (!(typeof foreignKey === 'string' && foreignKey)) {
      throw new Error('foreignKey parameter is missing');
    }
    if (!options.type) throw new Error('type option is missing');
    this.name = name;
    this.collectionName = collectionName;
    this.foreignKey = foreignKey;
    this.type = options.type;
  }

  get type() {
    return this._type;
  }
  set type(type) {
    if (!supportedTypes.includes(type)) throw new Error('Invalid type');
    this._type = type;
  }
}

export default Relation;
