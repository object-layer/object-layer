'use strict';

const SUPPORTED_TYPES = ['HAS_ONE', 'HAS_MANY', 'BELONGS_TO'];

export class Relation {
  constructor(name, { type, collectionClassName, itemClassName, foreignKey } = {}) {
    if (typeof name !== 'string' || !name) {
      throw new Error('name parameter is missing');
    }
    if (!(collectionClassName || itemClassName)) {
      throw new Error('collectionClassName or itemClassName parameter is missing');
    }
    if (!(typeof foreignKey === 'string' && foreignKey)) {
      throw new Error('foreignKey parameter is missing');
    }
    if (!type) throw new Error('type parameter is missing');
    if (!SUPPORTED_TYPES.includes(type)) throw new Error('Invalid relation type');

    this.name = name;
    this.type = type;
    if (collectionClassName) this.collectionClassName = collectionClassName;
    if (itemClassName) this.itemClassName = itemClassName;
    this.foreignKey = foreignKey;
  }
}

export default Relation;
