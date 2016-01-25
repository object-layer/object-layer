'use strict';

const SUPPORTED_TYPES = ['HAS_ONE', 'HAS_MANY', 'BELONGS_TO'];

export class Relation {
  constructor(name, { type, className, foreignKey } = {}) {
    if (typeof name !== 'string' || !name) {
      throw new Error('name parameter is missing');
    }
    if (!(className)) {
      throw new Error('className parameter is missing');
    }
    if (!(typeof foreignKey === 'string' && foreignKey)) {
      throw new Error('foreignKey parameter is missing');
    }
    if (!type) throw new Error('type parameter is missing');
    if (!SUPPORTED_TYPES.includes(type)) throw new Error('Invalid relation type');

    this.name = name;
    this.type = type;
    if (className) this.className = className;
    this.foreignKey = foreignKey;
  }
}

export default Relation;
