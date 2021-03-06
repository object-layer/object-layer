'use strict';

import { assert } from 'chai';
import { AbstractDate } from 'abstract-date';
import { LocalStore, model, Model, primaryKey, foreignKey, field, createdOn, hasOne, hasMany, belongsTo } from '../src';

async function catchError(fn) {
  let err;
  try {
    await fn();
  } catch (e) {
    err = e;
  }
  return err;
}

describe('LocalStore', function() {
  this.timeout(15000);

  let store;

  before(async function() {
    class Element extends Model {
      @primaryKey() id;
      @createdOn() createdOn;
    }

    class Account extends Element {
      @field(Number) accountNumber;
      @field(String) country;
    }

    class Person extends Account {
      @field(String) firstName;
      @field(String) lastName;
      @field(AbstractDate) birthdate;
    }

    class Company extends Account {
      @field(String) name;
    }

    class TestStore extends LocalStore {
      @model(Element, { indexes: ['createdOn'] }) Element;
      @model(Account, { indexes: ['accountNumber', 'country'] }) Account;
      @model(Person, { indexes: ['accountNumber', 'country', ['lastName', 'firstName']] }) Person;
      @model(Company, { indexes: ['country', 'name'] }) Company;
    }

    store = new TestStore({
      name: 'TestStore',
      url: 'mysql://test@localhost/test'
    });
  });

  after(async function() {
    await store.destroyAll();
  });

  it('should provide a way to get the root model', async function() {
    const model = store.getRootModel();
    assert.equal(model.getName(), 'Element');
  });

  it('should have an unique id', async function() {
    const id = await store.getStoreId();
    assert.ok(id);
  });

  it('should be able to put, get and delete some items', async function() {
    const mvila = new store.Person({
      accountNumber: 12345,
      firstName: 'Manuel',
      lastName: 'Vila',
      country: 'Japan',
      birthdate: '1972-09-25T00:00:00.000'
    });
    assert.isUndefined(mvila.createdOn);
    await mvila.save();
    assert.isDefined(mvila.createdOn);
    const id = mvila.id;
    let item = await store.Person.get(id);
    assert.strictEqual(item.accountNumber, 12345);
    assert.strictEqual(item.firstName, 'Manuel');
    const hasBeenDeleted = await item.delete();
    assert.isTrue(hasBeenDeleted);
    item = await store.Person.get(id, { errorIfMissing: false });
    assert.isUndefined(item);
  });

  it('should throw an error when an item is missing', async function() {
    const err = await catchError(async function() {
      await store.Person.get('xyz');
    });
    assert.instanceOf(err, Error);

    const item = await store.Person.get('xyz', { errorIfMissing: false });
    assert.isUndefined(item);
  });

  it('should throw an error when an item already exist', async function() {
    const jack = new store.Person({ firstName: 'Jack', country: 'USA' });
    await jack.save();
    const jack2 = new store.Person({ id: jack.id, firstName: 'Jack', country: 'UK' });
    const err = await catchError(async function() {
      await jack2.save();
    });
    assert.instanceOf(err, Error);

    await jack.delete();
  });

  it('should throw an error when deleting a missing item', async function() {
    let err = await catchError(async function() {
      await store.Person.delete('xyz');
    });
    assert.instanceOf(err, Error);

    let hasBeenDeleted;
    err = await catchError(async function() {
      hasBeenDeleted = await store.Person.delete('xyz', { errorIfMissing: false });
    });
    assert.isFalse(hasBeenDeleted);
    assert.isUndefined(err);
  });

  it('should provide saved, isNew and isModified properties', async function() {
    const emptyPerson = new store.Person();
    assert.isUndefined(emptyPerson.saved);
    assert.isTrue(emptyPerson.isNew);
    assert.isTrue(emptyPerson.isModified);

    const mvila = new store.Person({
      accountNumber: 12345,
      firstName: 'Manuel',
      lastName: 'Vila',
      country: 'Japan'
    });
    assert.isUndefined(mvila.saved);
    assert.isTrue(mvila.isNew);
    assert.isTrue(mvila.isModified);

    await mvila.save();
    assert.isDefined(mvila.saved);
    assert.equal(mvila.accountNumber, 12345);
    assert.equal(mvila.accountNumber, mvila.saved.accountNumber);
    assert.isFalse(mvila.isNew);
    assert.isFalse(mvila.isModified);

    mvila.accountNumber++;
    assert.equal(mvila.accountNumber, 12346);
    assert.notEqual(mvila.accountNumber, mvila.saved.accountNumber);
    assert.isFalse(mvila.isNew);
    assert.isTrue(mvila.isModified);

    await mvila.save();
    assert.isFalse(mvila.isModified);

    const id = mvila.id;
    const item = await store.Person.get(id);
    assert.isDefined(item.saved);
    assert.equal(item.accountNumber, 12346);
    assert.equal(item.accountNumber, item.saved.accountNumber);
    assert.isFalse(item.isNew);
    assert.isFalse(item.isModified);

    await item.delete();
    assert.isUndefined(item.saved);
    assert.isTrue(item.isNew);
    assert.isTrue(item.isModified);
  });

  describe('with several items', function() {
    beforeEach(async function() {
      await store.Account.put({
        id: 'aaa',
        accountNumber: 45329,
        country: 'France'
      });
      await store.Person.put({
        id: 'bbb',
        accountNumber: 3246,
        firstName: 'Jack',
        lastName: 'Daniel',
        country: 'USA'
      });
      await store.Company.put({
        id: 'ccc',
        accountNumber: 7002,
        name: 'Kinda Ltd',
        country: 'China'
      });
      await store.Person.put({
        id: 'ddd',
        accountNumber: 55498,
        firstName: 'Vincent',
        lastName: 'Vila',
        country: 'USA'
      });
      await store.Person.put({
        id: 'eee',
        accountNumber: 888,
        firstName: 'Pierre',
        lastName: 'Dupont',
        country: 'France'
      });
      await store.Company.put({
        id: 'fff',
        accountNumber: 8775,
        name: 'Fleur SARL',
        country: 'France'
      });
    });

    afterEach(async function() {
      await store.Account.delete('aaa', { errorIfMissing: false });
      await store.Account.delete('bbb', { errorIfMissing: false });
      await store.Account.delete('ccc', { errorIfMissing: false });
      await store.Account.delete('ddd', { errorIfMissing: false });
      await store.Account.delete('eee', { errorIfMissing: false });
      await store.Account.delete('fff', { errorIfMissing: false });
    });

    it('should be able to get many items by id', async function() {
      const items = await store.Account.getMany(['aaa', 'ccc']);
      assert.strictEqual(items.length, 2);
      assert.strictEqual(items[0].constructor.getName(), 'Account');
      assert.strictEqual(items[0].id, 'aaa');
      assert.strictEqual(items[0].accountNumber, 45329);
      assert.deepEqual(items[1].constructor.getName(), 'Company');
      assert.strictEqual(items[1].id, 'ccc');
      assert.strictEqual(items[1].accountNumber, 7002);
    });

    it('should be able to find all items', async function() {
      const items = await store.Company.find();
      assert.strictEqual(items.length, 2);
      assert.strictEqual(items[0].constructor.getName(), 'Company');
      assert.strictEqual(items[0].id, 'ccc');
      assert.strictEqual(items[0].name, 'Kinda Ltd');
      assert.strictEqual(items[1].constructor.getName(), 'Company');
      assert.strictEqual(items[1].id, 'fff');
      assert.strictEqual(items[1].name, 'Fleur SARL');
    });

    it('should be able to find and order items', async function() {
      const items = await store.Person.find({ order: 'accountNumber' });
      assert.strictEqual(items.length, 3);
      const numbers = items.map(item => item.accountNumber);
      assert.deepEqual(numbers, [888, 3246, 55498]);
    });

    it('shoud be able to find items with a query', async function() {
      let items = await store.Account.find({ query: { country: 'USA' } });
      const ids = items.map(item => item.id);
      assert.deepEqual(ids, ['bbb', 'ddd']);

      items = await store.Company.find({ query: { country: 'UK' } });
      assert.strictEqual(items.length, 0);
    });

    it('shoud be able to count all items', async function() {
      const count = await store.Person.count();
      assert.strictEqual(count, 3);
    });

    it('shoud be able to count items with a query', async function() {
      let count = await store.Account.count({ query: { country: 'France' } });
      assert.strictEqual(count, 3);

      count = await store.Person.count({ query: { country: 'France' } });
      assert.strictEqual(count, 1);

      count = await store.Company.count({ query: { country: 'Spain' } });
      assert.strictEqual(count, 0);
    });

    it('shoud be able to iterate over items', async function() {
      const ids = [];
      await store.Account.forEach({ batchSize: 2 }, async function(item) {
        ids.push(item.id);
      });
      assert.deepEqual(ids, ['aaa', 'bbb', 'ccc', 'ddd', 'eee', 'fff']);
    });

    it('shoud be able to find and delete items', async function() {
      const options = { query: { country: 'France' }, batchSize: 2 };
      let deletedItemsCount = await store.Account.findAndDelete(options);
      assert.strictEqual(deletedItemsCount, 3);
      const items = await store.Account.find();
      const ids = items.map(item => item.id);
      assert.deepEqual(ids, ['bbb', 'ccc', 'ddd']);
      deletedItemsCount = await store.Account.findAndDelete(options);
      assert.strictEqual(deletedItemsCount, 0);
    });

    it('shoud be able to change an item inside a transaction', async function() {
      let item = await store.Person.get('bbb');
      assert.strictEqual(item.lastName, 'Daniel');
      assert.isFalse(item.insideTransaction);
      await item.transaction(async function(transactionItem) {
        assert.isTrue(transactionItem.insideTransaction);
        transactionItem.lastName = 'D.';
        await transactionItem.save();
        const loadedItem = await transactionItem.constructor.get('bbb');
        assert.strictEqual(loadedItem.lastName, 'D.');
      });
      assert.strictEqual(item.lastName, 'D.');
      item = await store.Person.get('bbb');
      assert.strictEqual(item.lastName, 'D.');
    });

    it('shoud be able cancel a change inside an aborted transaction', async function() {
      let item = await store.Person.get('bbb');
      assert.strictEqual(item.lastName, 'Daniel');
      let almostDone;
      const err = await catchError(async function() {
        assert.isFalse(item.insideTransaction);
        await item.transaction(async function(transactionItem) {
          assert.isTrue(transactionItem.insideTransaction);
          transactionItem.lastName = 'D.';
          await transactionItem.save();
          const loadedItem = await transactionItem.constructor.get('bbb');
          assert.strictEqual(loadedItem.lastName, 'D.');
          almostDone = true;
          throw new Error('Something is wrong');
        });
      });
      assert.isTrue(almostDone);
      assert.instanceOf(err, Error);
      assert.strictEqual(item.lastName, 'Daniel');
      item = await store.Person.get('bbb');
      assert.strictEqual(item.lastName, 'Daniel');
    });
  }); // 'with several items' suite
}); // LocalStore

describe('Relations', function() {
  describe('hasOne/belongsTo', function() {
    let store, user, profileId;

    before(async function() {
      class User extends Model {
        @primaryKey() id;
        @field(String) name;
        @hasOne('Profile', 'userId') profile;
      }

      class Profile extends Model {
        @primaryKey() id;
        @foreignKey() userId;
        @field(String) country;
        @belongsTo('User', 'userId') user;
      }

      class TestStore extends LocalStore {
        @model(User) User;
        @model(Profile, { indexes: ['userId'] }) Profile;
      }

      store = new TestStore({
        name: 'TestHasOne',
        url: 'mysql://test@localhost/test'
      });
    });

    after(async function() {
      await store.destroyAll();
    });

    it('should handle item creation', async function() {
      user = await store.User.put({ id: 'user1', name: 'mvila' });
      user.profile.country = 'Japan';
      assert.isUndefined(user.profile.id);
      await user.profile.save();
      assert.isDefined(user.profile.id);
      profileId = user.profile.id;

      const profiles = await store.Profile.find();
      assert.lengthOf(profiles, 1);
      assert.deepEqual(profiles[0].serialize(), { id: profileId, userId: 'user1', country: 'Japan' });
    });

    it('should be able to load a related item', async function() {
      user = await store.User.get('user1');
      assert.isUndefined(user.profile.country);
      await user.profile.load();
      assert.deepEqual(user.profile.serialize(), { id: profileId, userId: 'user1', country: 'Japan' });
      assert.strictEqual(user.profile.user, user);
    });

    it('should be able to load a parent item', async function() {
      const profile = await store.Profile.get(profileId);
      assert.isUndefined(profile.user.name);
      await profile.user.load();
      assert.equal(profile.user.name, 'mvila');
    });

    it('should be able to delete a related item', async function() {
      user = await store.User.get('user1');
      const hasBeenDeleted = await user.profile.delete();
      assert.isTrue(hasBeenDeleted);
      const count = await store.Profile.count();
      assert.equal(count, 0);
    });
  }); // hasOne/belongsTo

  describe('hasMany/belongsTo', function() {
    let store, album;

    before(async function() {
      class Album extends Model {
        @primaryKey() id;
        @field(String) name;
        @hasMany('Photo', 'albumId') photos;
      }

      class Photo extends Model {
        @primaryKey() id;
        @foreignKey() albumId;
        @belongsTo('Album', 'albumId') album;
      }

      class TestStore extends LocalStore {
        @model(Album) Album;
        @model(Photo, { indexes: ['albumId'] }) Photo;
      }

      store = new TestStore({
        name: 'TestHasMany',
        url: 'mysql://test@localhost/test'
      });

      await store.Photo.put('photo0');
    });

    after(async function() {
      await store.destroyAll();
    });

    it('should handle item creation', async function() {
      album = await store.Album.put({ id: 'album1', name: 'My album' });
      await album.photos.put('photo1');
      await album.photos.put('photo2');

      const photos = await store.Photo.find();
      assert.lengthOf(photos, 3);
      assert.deepEqual(photos[0].serialize(), { id: 'photo0' });
      assert.deepEqual(photos[1].serialize(), { id: 'photo1', albumId: 'album1' });
      assert.deepEqual(photos[2].serialize(), { id: 'photo2', albumId: 'album1' });
    });

    it('should be able to find related items', async function() {
      const photos = await album.photos.find();
      assert.lengthOf(photos, 2);
      assert.deepEqual(photos[0].serialize(), { id: 'photo1', albumId: 'album1' });
      assert.strictEqual(photos[0].album, album);
      assert.deepEqual(photos[1].serialize(), { id: 'photo2', albumId: 'album1' });
      assert.strictEqual(photos[1].album, album);
    });

    it('should be able to count related items', async function() {
      const count = await album.photos.count();
      assert.equal(count, 2);
    });

    it('should be able to load a parent item', async function() {
      const photo1 = await store.Photo.get('photo1');
      await photo1.album.load();
      assert.deepEqual(
        photo1.album.serialize(),
        { id: 'album1', name: 'My album' }
      );
    });

    it('should be able to find and delete related items', async function() {
      const deletedItemsCount = await album.photos.findAndDelete();
      assert.equal(deletedItemsCount, 2);
      const count = await store.Photo.count();
      assert.equal(count, 1);
    });
  }); // hasMany/belongsTo
}); // Relations
