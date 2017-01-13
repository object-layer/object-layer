'use strict';

import { assert } from 'chai';
import { Model, primaryKey, foreignKey, field, createdOn, updatedOn, hasMany } from '../src';

describe('Model', function() {
  it('should provide decorators to easily define fields', function() {
    class Person extends Model {
      @primaryKey() id;
      @foreignKey() groupId;
      @field(String) name;
      @field(Number) age;
      @createdOn() createdOn;
      @updatedOn() updatedOn;
    }

    let fld;

    fld = Person.prototype.primaryKeyField;
    assert.equal(fld.name, 'id');
    assert.strictEqual(fld.type, String);

    fld = Person.prototype.getField('groupId');
    assert.equal(fld.name, 'groupId');
    assert.strictEqual(fld.type, String);

    fld = Person.prototype.getField('name');
    assert.equal(fld.name, 'name');
    assert.strictEqual(fld.type, String);

    fld = Person.prototype.getField('age');
    assert.equal(fld.name, 'age');
    assert.strictEqual(fld.type, Number);

    fld = Person.prototype.getField('createdOn');
    assert.equal(fld.name, 'createdOn');
    assert.strictEqual(fld.type, Date);

    fld = Person.prototype.getField('updatedOn');
    assert.equal(fld.name, 'updatedOn');
    assert.strictEqual(fld.type, Date);
  });

  it('should provide decorators to define relations', function() {
    class Person extends Model {
      @hasMany('Photo', 'personId') photos;
    }

    const relation = Person.prototype.getRelation('photos');
    assert.equal(relation.name, 'photos');
    assert.equal(relation.className, 'Photo');
    assert.equal(relation.foreignKey, 'personId');
    assert.equal(relation.type, 'HAS_MANY');
  });
}); // Model
