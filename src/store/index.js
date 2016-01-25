'use strict';

import { EventEmitterMixin } from 'event-emitter-mixin';

export class Store extends EventEmitterMixin() {
  constructor(options = {}) {
    super();

    if (!options.name) throw new Error('Store name is missing');
    if (!options.url) throw new Error('Store URL is missing');

    this.context = options.context;
    this.name = options.name;
    this.url = options.url;
    this.log = options.log || (this.context && this.context.log);

    this.root = this;
  }

  use(plugin) {
    plugin.plug(this);
  }

  getModelRegistration(name) {
    return this._modelRegistrations && this._modelRegistrations[name];
  }

  setModelRegistration(name, model, options = {}) {
    if (!model) throw new Error('model parameter is missing');
    let registration = { name, model };
    if (options.indexes) registration.indexes = options.indexes;
    if (!this.hasOwnProperty('_modelRegistrations')) {
      this._modelRegistrations = Object.create(this._modelRegistrations || null);
    }
    this._modelRegistrations[name] = registration;
    return registration;
  }

  forEachModelRegistration(fn, thisArg) {
    for (let name in this._modelRegistrations) {
      let registration = this._modelRegistrations[name];
      fn.call(thisArg, registration, name);
    }
  }

  registerModel(name, model, options, decoratorDescriptor) {
    let registration = this.setModelRegistration(name, model, options);
    let descriptor;
    if (decoratorDescriptor) {
      delete decoratorDescriptor.initializer; // TODO: check if this is still required
      descriptor = decoratorDescriptor;
    } else {
      descriptor = {};
    }
    descriptor.get = function() {
      return this.getModel(name);
    };
    if (!decoratorDescriptor) {
      Object.defineProperty(this, name, descriptor);
    }
    return registration;
  }

  getModel(name, cache = this) {
    if (!cache.hasOwnProperty('_modelCache')) cache._modelCache = {};
    if (cache._modelCache[name]) return cache._modelCache[name];
    let registration = this.getModelRegistration(name);
    if (!registration) {
      throw new Error(`Model '${name}' not found`);
    }
    let model = class extends registration.model {};
    model.setName(registration.model.getName());
    model.store = this;
    cache._modelCache[name] = model;
    return model;
  }

  getRootModel() {
    if (this._rootModel) return this._rootModel;
    let rootModel;
    this.forEachModelRegistration(function(registration) {
      let classNames = registration.model.getClassNames();
      if (classNames.length === 1) { // TODO: maybe there is a better way
        if (rootModel) {
          throw new Error('More than one root model found');
        }
        rootModel = registration.model;
      }
    });
    if (!rootModel) {
      throw new Error('Root model not found');
    }
    this.root._rootModel = rootModel;
    return rootModel;
  }
}

export function model(model, options) {
  return function(target, name, descriptor) {
    Store.prototype.registerModel.call(target, name, model, options, descriptor);
  };
}

export default Store;
