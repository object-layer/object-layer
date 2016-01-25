'use strict';

import { assert } from 'chai';
import { Store, Collection, Item, primaryKey, foreignKey, field, createdOn, updatedOn, hasOne, hasMany, belongsTo } from './src';

async function catchError(fn) {
  let err;
  try {
    await fn();
  } catch (e) {
    err = e;
  }
  return err;
}

describe('ObjectLayer', function() {
  describe('Item class', function() {
    it('should provide decorators to easily define various fields', function() {
      class Person extends Item {
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
      class Person extends Item {
        @hasMany('Photos', 'personId') photos;
      }

      let relation = Person.prototype.getRelation('photos');
      assert.equal(relation.name, 'photos');
      assert.equal(relation.collectionClassName, 'Photos');
      assert.equal(relation.foreignKey, 'personId');
      assert.equal(relation.type, 'HAS_MANY');
    });
  }); // Item class definition

  describe('Store', function() {
    let store, accounts, people, companies;

    before(async function() {
      class Elements extends Collection {
        static Item = class Element extends Collection.Item {
          @primaryKey() id;
          @createdOn() createdOn;
        };
      }

      class Accounts extends Elements {
        static Item = class Account extends Elements.Item {
          @field(Number) accountNumber;
          @field(String) country;
        };
      }

      class People extends Accounts {
        static Item = class Person extends Accounts.Item {
          @field(String) firstName;
          @field(String) lastName;
        };
      }

      class Companies extends Accounts {
        static Item = class Company extends Accounts.Item {
          @field(String) name;
        };
      }

      store = new Store({
        name: 'TestStore',
        url: 'mysql://test@localhost/test',
        collections: [
          { class: Elements, indexes: ['createdOn'] },
          { class: Accounts, indexes: ['accountNumber', 'country'] },
          { class: People, indexes: ['accountNumber', 'country', ['lastName', 'firstName']] },
          { class: Companies, indexes: ['country', 'name'] }
        ]
      });

      accounts = store.createCollection('Accounts');
      people = store.createCollection('People');
      companies = store.createCollection('Companies');
    });

    after(async function() {
      await store.destroyAll();
    });

    it('should provide a way to get the root collection', async function() {
      let klass = store.getRootCollectionClass();
      assert.equal(klass.name, 'Elements');
    });

    it('should have an unique id', async function() {
      let id = await store.getStoreId();
      assert.ok(id);
    });

    it('should be able to put, get and delete some items', async function() {
      let mvila = people.create({
        accountNumber: 12345,
        firstName: 'Manuel',
        lastName: 'Vila',
        country: 'Japan'
      });
      assert.isUndefined(mvila.createdOn);
      await mvila.save();
      assert.isDefined(mvila.createdOn);
      let id = mvila.id;
      let item = await people.get(id);
      assert.strictEqual(item.accountNumber, 12345);
      assert.strictEqual(item.firstName, 'Manuel');
      let hasBeenDeleted = await item.delete();
      assert.isTrue(hasBeenDeleted);
      item = await people.get(id, { errorIfMissing: false });
      assert.isUndefined(item);
    });

    it('should throw an error when an item is missing', async function() {
      let err = await catchError(async function() {
        await people.get('xyz');
      });
      assert.instanceOf(err, Error);

      let item = await people.get('xyz', { errorIfMissing: false });
      assert.isUndefined(item);
    });

    it('should throw an error when an item already exist', async function() {
      let jack = people.create({ firstName: 'Jack', country: 'USA' });
      await jack.save();
      let jack2 = people.create({ id: jack.id, firstName: 'Jack', country: 'UK' });
      let err = await catchError(async function() {
        await jack2.save();
      });
      assert.instanceOf(err, Error);

      await jack.delete();
    });

    it('should throw an error when deleting a missing item', async function() {
      let err = await catchError(async function() {
        await people.delete('xyz');
      });
      assert.instanceOf(err, Error);

      let hasBeenDeleted;
      err = await catchError(async function() {
        hasBeenDeleted = await people.delete('xyz', { errorIfMissing: false });
      });
      assert.isFalse(hasBeenDeleted);
      assert.isUndefined(err);
    });

    describe('with several items', function() {
      beforeEach(async function() {
        await accounts.put({
          id: 'aaa',
          accountNumber: 45329,
          country: 'France'
        });
        await people.put({
          id: 'bbb',
          accountNumber: 3246,
          firstName: 'Jack',
          lastName: 'Daniel',
          country: 'USA'
        });
        await companies.put({
          id: 'ccc',
          accountNumber: 7002,
          name: 'Kinda Ltd',
          country: 'China'
        });
        await people.put({
          id: 'ddd',
          accountNumber: 55498,
          firstName: 'Vincent',
          lastName: 'Vila',
          country: 'USA'
        });
        await people.put({
          id: 'eee',
          accountNumber: 888,
          firstName: 'Pierre',
          lastName: 'Dupont',
          country: 'France'
        });
        await companies.put({
          id: 'fff',
          accountNumber: 8775,
          name: 'Fleur SARL',
          country: 'France'
        });
      });

      afterEach(async function() {
        await accounts.delete('aaa', { errorIfMissing: false });
        await accounts.delete('bbb', { errorIfMissing: false });
        await accounts.delete('ccc', { errorIfMissing: false });
        await accounts.delete('ddd', { errorIfMissing: false });
        await accounts.delete('eee', { errorIfMissing: false });
        await accounts.delete('fff', { errorIfMissing: false });
      });

      it('should be able to get many items by id', async function() {
        let items = await accounts.getMany(['aaa', 'ccc']);
        assert.strictEqual(items.length, 2);
        assert.strictEqual(items[0].constructor.name, 'Account');
        assert.strictEqual(items[0].id, 'aaa');
        assert.strictEqual(items[0].accountNumber, 45329);
        assert.deepEqual(items[1].constructor.name, 'Company');
        assert.strictEqual(items[1].id, 'ccc');
        assert.strictEqual(items[1].accountNumber, 7002);
      });

      it('should be able to find all items', async function() {
        let items = await companies.find();
        assert.strictEqual(items.length, 2);
        assert.strictEqual(items[0].constructor.name, 'Company');
        assert.strictEqual(items[0].id, 'ccc');
        assert.strictEqual(items[0].name, 'Kinda Ltd');
        assert.strictEqual(items[1].constructor.name, 'Company');
        assert.strictEqual(items[1].id, 'fff');
        assert.strictEqual(items[1].name, 'Fleur SARL');
      });

      it('should be able to find and order items', async function() {
        let items = await people.find({ order: 'accountNumber' });
        assert.strictEqual(items.length, 3);
        let numbers = items.map(item => item.accountNumber);
        assert.deepEqual(numbers, [888, 3246, 55498]);
      });

      it('shoud be able to find items with a query', async function() {
        let items = await accounts.find({ query: { country: 'USA' } });
        let ids = items.map(item => item.id);
        assert.deepEqual(ids, ['bbb', 'ddd']);

        items = await companies.find({ query: { country: 'UK' } });
        assert.strictEqual(items.length, 0);
      });

      it('shoud be able to count all items in a collection', async function() {
        let count = await people.count();
        assert.strictEqual(count, 3);
      });

      it('shoud be able to count items with a query', async function() {
        let count = await accounts.count({ query: { country: 'France' } });
        assert.strictEqual(count, 3);

        count = await people.count({ query: { country: 'France' } });
        assert.strictEqual(count, 1);

        count = await companies.count({ query: { country: 'Spain' } });
        assert.strictEqual(count, 0);
      });

      it('shoud be able to iterate over items', async function() {
        let ids = [];
        await accounts.forEach({ batchSize: 2 }, async function(item) {
          ids.push(item.id);
        });
        assert.deepEqual(ids, ['aaa', 'bbb', 'ccc', 'ddd', 'eee', 'fff']);
      });

      it('shoud be able to find and delete items', async function() {
        let options = { query: { country: 'France' }, batchSize: 2 };
        let deletedItemsCount = await accounts.findAndDelete(options);
        assert.strictEqual(deletedItemsCount, 3);
        let items = await accounts.find();
        let ids = items.map(item => item.id);
        assert.deepEqual(ids, ['bbb', 'ccc', 'ddd']);
        deletedItemsCount = await accounts.findAndDelete(options);
        assert.strictEqual(deletedItemsCount, 0);
      });

      it('shoud be able to change an item inside a transaction', async function() {
        let item = await people.get('bbb');
        assert.strictEqual(item.lastName, 'Daniel');
        assert.isFalse(item.insideTransaction);
        await item.transaction(async function(transactionItem) {
          assert.isTrue(transactionItem.insideTransaction);
          transactionItem.lastName = 'D.';
          await transactionItem.save();
          let loadedItem = await transactionItem.collection.get('bbb');
          assert.strictEqual(loadedItem.lastName, 'D.');
        });
        assert.strictEqual(item.lastName, 'D.');
        item = await people.get('bbb');
        assert.strictEqual(item.lastName, 'D.');
      });

      it('shoud be able cancel a change inside an aborted transaction', async function() {
        let item = await people.get('bbb');
        assert.strictEqual(item.lastName, 'Daniel');
        let err = await catchError(async function() {
          assert.isFalse(item.insideTransaction);
          await item.transaction(async function(transactionItem) {
            assert.isTrue(transactionItem.insideTransaction);
            transactionItem.lastName = 'D.';
            await transactionItem.save();
            let loadedItem = await transactionItem.collection.get('bbb');
            assert.strictEqual(loadedItem.lastName, 'D.');
            throw new Error('something is wrong');
          });
        });
        assert.instanceOf(err, Error);
        assert.strictEqual(item.lastName, 'Daniel');
        item = await people.get('bbb');
        assert.strictEqual(item.lastName, 'Daniel');
      });
    }); // 'with several items' suite
  }); // Store

  describe('Relations', function() {
    describe('hasOne/belongsTo', function() {
      let store, usersCollection, profilesCollection, user, profileId;

      before(async function() {
        class Users extends Collection {
          static Item = class User extends Collection.Item {
            @primaryKey() id;
            @field(String) name;
            @hasOne('Profile', 'userId') profile;
          };
        }

        class Profiles extends Collection {
          static Item = class Profile extends Collection.Item {
            @primaryKey() id;
            @foreignKey() userId;
            @field(String) country;
            @belongsTo('User', 'userId') user;
          };
        }

        store = new Store({
          name: 'TestHasOne',
          url: 'mysql://test@localhost/test',
          collections: [
            { class: Users },
            { class: Profiles, indexes: ['userId'] }
          ]
        });

        usersCollection = store.createCollection('Users');
        profilesCollection = store.createCollection('Profiles');
      });

      after(async function() {
        await store.destroyAll();
      });

      it('should handle item creation', async function() {
        user = await usersCollection.put({ id: 'user1', name: 'mvila' });
        user.profile.country = 'Japan';
        assert.isUndefined(user.profile.id);
        await user.profile.save();
        assert.isDefined(user.profile.id);
        profileId = user.profile.id;

        let profiles = await profilesCollection.find();
        assert.lengthOf(profiles, 1);
        assert.deepEqual(profiles[0].serialize(), { id: profileId, userId: 'user1', country: 'Japan' });
      });

      it('should be able to load a related item', async function() {
        user = await usersCollection.get('user1');
        assert.isUndefined(user.profile.country);
        // await user.profile.load();
      });
    }); // hasOne/belongsTo

    describe('hasMany/belongsTo', function() {
      let store, albumsCollection, photosCollection, album;

      before(async function() {
        class Albums extends Collection {
          static Item = class Album extends Collection.Item {
            @primaryKey() id;
            @field(String) name;
            @hasMany('Photos', 'albumId') photos;
          };
        }

        class Photos extends Collection {
          static Item = class Photo extends Collection.Item {
            @primaryKey() id;
            @foreignKey() albumId;
            @belongsTo('Album', 'albumId') album;
          };
        }

        store = new Store({
          name: 'TestHasMany',
          url: 'mysql://test@localhost/test',
          collections: [
            { class: Albums },
            { class: Photos, indexes: ['albumId'] }
          ]
        });

        albumsCollection = store.createCollection('Albums');
        photosCollection = store.createCollection('Photos');

        await photosCollection.put('photo0');
      });

      after(async function() {
        await store.destroyAll();
      });

      it('should handle item creation', async function() {
        album = await albumsCollection.put({ id: 'album1', name: 'My album' });
        await album.photos.put('photo1');
        await album.photos.put('photo2');

        let photos = await photosCollection.find();
        assert.lengthOf(photos, 3);
        assert.deepEqual(photos[0].serialize(), { id: 'photo0' });
        assert.deepEqual(photos[1].serialize(), { id: 'photo1', albumId: 'album1' });
        assert.deepEqual(photos[2].serialize(), { id: 'photo2', albumId: 'album1' });
      });

      it('should be able to find related items', async function() {
        let photos = await album.photos.find();
        assert.lengthOf(photos, 2);
        assert.deepEqual(photos[0].serialize(), { id: 'photo1', albumId: 'album1' });
        assert.equal(photos[0].album, album);
        assert.deepEqual(photos[1].serialize(), { id: 'photo2', albumId: 'album1' });
        assert.equal(photos[1].album, album);
      });

      it('should be able to count related items', async function() {
        let count = await album.photos.count();
        assert.equal(count, 2);
      });

      it('should be able to load a parent item', async function() {
        let photo1 = await photosCollection.get('photo1');
        await photo1.album.load();
        assert.deepEqual(
          photo1.album.serialize(),
          { id: 'album1', name: 'My album' }
        );
      });

      it('should be able to find and delete related items', async function() {
        let deletedItemsCount = await album.photos.findAndDelete();
        assert.equal(deletedItemsCount, 2);
        let count = await photosCollection.count();
        assert.equal(count, 1);
      });
    }); // hasMany/belongsTo
  }); // Relations
});
