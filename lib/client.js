var Hoek = require('hoek');
var Joi = require('joi');
var yarp = require('yarp');
var URL = require('url');

var defaultOptions = {
  hostBase: '.vin.li',
  protocol: 'https',
  port: 443,
  apiVersion: 'v1'
};

var groupPrefix = {
  platform: 'platform',
  auth: 'auth',
  telemetry: 'telemetry',
  event: 'events',
  rule: 'rules',
  trip: 'trips',
  safety: 'safety'
};

var Client = function(_options) {
  Joi.assert(_options, Joi.object({
    hostBase: Joi.string().regex(/^[-_\.\da-zA-Z]+$/),
    protocol: Joi.string().allow([ 'http', 'https' ]),
    port: Joi.number().integer().min(1),
    apiVersion: Joi.string().allow([ 'v1' ]),
    appId: Joi.string(),
    secretKey: Joi.string(),
    accessToken: Joi.string(),
    serviceOrigins: Joi.object({
      platform: Joi.string().uri().required(),
      auth: Joi.string().uri().required(),
      telemetry: Joi.string().uri().required(),
      event: Joi.string().uri().required(),
      rule: Joi.string().uri().required(),
      trip: Joi.string().uri().required(),
      safety: Joi.string().uri().required()
    }).optional()
  }).required()
    .and('appId', 'secretKey')
    .xor('appId', 'accessToken')
    .nand('hostBase', 'serviceOrigins')
    .nand('protocol', 'serviceOrigins')
    .nand('port', 'serviceOrigins'));

  this.options = Hoek.applyToDefaults(defaultOptions, _options);

  if (this.options.accessToken) {
    this.authHeaders = {
      authorization: 'Bearer ' + this.options.accessToken
    };
  } else {
    this.authHeaders = {
      authorization: 'Basic ' + (new Buffer(this.options.appId + ':' + this.options.secretKey, 'utf8')).toString('base64')
    };
  }

  this.App = require('./app')(this);
  this.User = require('./user')(this);
  this.Auth = require('./auth')(this);
  this.Device = require('./device')(this);
  this.Vehicle = require('./vehicle')(this);
  this.Trip = require('./trip')(this);
  this.Event = require('./event')(this);
  this.Subscription = require('./subscription')(this);
  this.Rule = require('./rule')(this);
};

Client.prototype.originForGroup = function(group) {
  if (this.options.serviceOrigins) {
    return this.options.serviceOrigins[group];
  }

  return URL.format({
    protocol: this.options.protocol,
    hostname: groupPrefix[group] + this.options.hostBase,
    port: this.options.port
  });
};

Client.prototype.buildUrl = function(_group, _path, _query, _skipPrefix) {
  return URL.resolve(
    this.originForGroup(_group),
    URL.format({
      pathname: (_skipPrefix ? '' : ('/api/' + this.options.apiVersion)) + '/' + _path,
      query: _query
    })
  );
};

Client.prototype.getRaw = function(url) {
  return yarp({
    url: url,
    headers: this.authHeaders
  });
};

Client.prototype.authGet = function(_path, _accessToken) {
  return yarp({
    url: this.buildUrl('auth', _path, { access_token: _accessToken }, true)
  });
};

Client.prototype.get = function(_group, _path, _query) {
  return this.getRaw(this.buildUrl(_group, _path, _query));
};

Client.prototype.post = function(_group, _path, _payload, _skipPrefix) {
  return yarp({
    url: this.buildUrl(_group, _path, {}, _skipPrefix),
    method: 'POST',
    json: _payload,
    headers: this.authHeaders
  });
};

Client.prototype.put = function(_group, _path, _payload) {
  return yarp({
    url: this.buildUrl(_group, _path),
    method: 'PUT',
    json: _payload,
    headers: this.authHeaders
  });
};

Client.prototype.delete = function(_group, _path) {
  return yarp({
    url: this.buildUrl(_group, _path),
    method: 'DELETE',
    headers: this.authHeaders
  });
};

Client.prototype.getEntireStream = function(url, listName) {
  return this.getRaw(url).then(function(data) {
    if (data.meta.pagination.links.prior) {
      return this.getEntireStream(data.meta.pagination.links.prior, listName).then(function(locs) {
        return data[listName].concat(locs);
      });
    }

    return data[listName];
  });
};

Client.prototype.getEntireLocationStream = function(url) {
  return this.getRaw(url).then(function(data) {
    if (data.meta.pagination.links.prior) {
      return this.getEntireLocationStream(data.meta.pagination.links.prior).then(function(locs) {
        return data.locations.features.concat(locs);
      });
    }

    return data.locations.features;
  });
};

module.exports = Client;