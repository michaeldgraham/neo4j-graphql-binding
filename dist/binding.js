'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.buildBindings = undefined;

var _graphql = require('graphql');

var _typedefs = require('./typedefs.js');

var buildBindings = exports.buildBindings = function buildBindings(_ref) {
  var typeDefs = _ref.typeDefs,
      binding = _ref.binding,
      log = _ref.log;

  var parsed = (0, _graphql.parse)(typeDefs);
  var operationTypes = (0, _typedefs.getOperationTypes)(parsed);
  var queries = operationTypes.query;
  var wrappers = {
    query: {},
    mutation: {}
  };
  var fieldName = "";
  queries.fields.forEach(function (field) {
    fieldName = field.name.value;
    wrappers.query[fieldName] = queryBindingWrapper(fieldName, binding, log);
  });
  var mutations = operationTypes.mutation;
  mutations.fields.forEach(function (field) {
    fieldName = field.name.value;
    wrappers.mutation[fieldName] = mutationBindingWrapper(fieldName, binding, log);
  });
  return wrappers;
};

var queryBindingWrapper = function queryBindingWrapper(fieldName, binding, log) {
  return function (params, ctx, info) {
    ctx.localInfo = info;
    ctx.requestType = "query";
    ctx.logRequests = log;
    return binding.query[fieldName](params, ctx, info);
  };
};
var mutationBindingWrapper = function mutationBindingWrapper(fieldName, binding, log) {
  return function (params, ctx, info) {
    ctx.localInfo = info;
    ctx.requestType = "mutation";
    ctx.logRequests = log;
    return binding.mutation[fieldName](params, ctx, info);
  };
};