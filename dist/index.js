'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.buildNeo4jResolvers = exports.buildNeo4jTypeDefs = exports.neo4jExecute = exports.neo4jGraphQLBinding = exports.neo4jIDL = exports.neo4jAssertConstraints = undefined;

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _graphql = require('graphql');

var _link = require('./link.js');

var _binding = require('./binding.js');

var _typedefs = require('./typedefs.js');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

var neo4jAssertConstraints = exports.neo4jAssertConstraints = function () {
  var _ref2 = _asyncToGenerator( /*#__PURE__*/_regenerator2.default.mark(function _callee(_ref) {
    var driver = _ref.driver,
        typeDefs = _ref.typeDefs,
        log = _ref.log;
    var constraints, session;
    return _regenerator2.default.wrap(function _callee$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            if (!(driver && typeDefs)) {
              _context.next = 6;
              break;
            }

            constraints = buildAssertionArguments(typeDefs);
            session = driver.session();
            _context.next = 5;
            return session.run('CALL apoc.schema.assert({indexes}, {constraints}) YIELD label, key, unique, action RETURN { label: label, key: key, unique: unique, action: action }', {
              indexes: {},
              constraints: constraints
            }).then(function (result) {
              if (log) logAssertionResult(result);
              return result;
              session.close();
            }).catch(function (error) {
              console.error(error);
            });

          case 5:
            return _context.abrupt('return', _context.sent);

          case 6:
          case 'end':
            return _context.stop();
        }
      }
    }, _callee, undefined);
  }));

  return function neo4jAssertConstraints(_x) {
    return _ref2.apply(this, arguments);
  };
}();
var neo4jIDL = exports.neo4jIDL = function () {
  var _ref4 = _asyncToGenerator( /*#__PURE__*/_regenerator2.default.mark(function _callee2(_ref3) {
    var driver = _ref3.driver,
        typeDefs = _ref3.typeDefs,
        log = _ref3.log;
    var cleanedTypeDefs, remoteTypeDefs, session;
    return _regenerator2.default.wrap(function _callee2$(_context2) {
      while (1) {
        switch (_context2.prev = _context2.next) {
          case 0:
            if (!(driver && typeDefs)) {
              _context2.next = 7;
              break;
            }

            cleanedTypeDefs = cleanCypherStatements(typeDefs);
            remoteTypeDefs = (0, _typedefs.buildTypeDefs)({
              typeDefs: cleanedTypeDefs,
              query: false,
              mutation: true,
              isForRemote: true
            });
            session = driver.session();
            _context2.next = 6;
            return session.run('CALL graphql.idl({schema}) YIELD value RETURN value', { schema: remoteTypeDefs }).then(function (result) {
              if (log) logIDLResult(result);
              return result;
              session.close();
            }).catch(function (error) {
              console.error(error);
            });

          case 6:
            return _context2.abrupt('return', _context2.sent);

          case 7:
          case 'end':
            return _context2.stop();
        }
      }
    }, _callee2, undefined);
  }));

  return function neo4jIDL(_x2) {
    return _ref4.apply(this, arguments);
  };
}();
var neo4jGraphQLBinding = exports.neo4jGraphQLBinding = function neo4jGraphQLBinding(config) {
  return new _binding.Neo4jGraphQLBinding(config);
};
var neo4jExecute = exports.neo4jExecute = function neo4jExecute(params, ctx, info, binding) {
  if (typeof binding !== "string") binding = "neo4j";
  switch (info.parentType.name) {
    case "Query":
      {
        return ctx[binding].query[info.fieldName](params, info);
      }
    case "Mutation":
      {
        return ctx[binding].mutation[info.fieldName](params, info);
      }
    case 'Subscription':
      {
        throw Error('Subscriptions not yet supported by neo4j-graphql-binding');
      }
  }
  throw Error('Unsupported value for parentType.name');
};
var buildNeo4jTypeDefs = exports.buildNeo4jTypeDefs = _typedefs.buildTypeDefs;
var buildNeo4jResolvers = exports.buildNeo4jResolvers = _typedefs.buildResolvers;
var buildAssertionArguments = function buildAssertionArguments(typeDefs) {
  var parsed = (0, _graphql.parse)(typeDefs);
  var models = (0, _typedefs.buildTypeMaps)(parsed).models;
  var fields = [];
  var modelFieldConstraintMap = {};
  var uniqueProperties = [];
  Object.keys(models).forEach(function (modelName) {
    fields = models[modelName].def.fields;
    uniqueProperties = (0, _link.getModelFieldMaps)(fields).uniqueProperties;
    if (uniqueProperties.indexOf("id") === -1) {
      uniqueProperties.push('id');
    }
    modelFieldConstraintMap[modelName] = uniqueProperties;
  });
  return modelFieldConstraintMap;
};
var formatAssertionResult = function formatAssertionResult(result) {
  var fieldMap = {};
  var formatted = {};
  var label = "";
  var key = "";
  result.records.forEach(function (record) {
    fieldMap = record._fields[0];
    label = fieldMap.label;
    key = fieldMap.key;
    if (!formatted[label]) formatted[label] = {};
    formatted[label][key] = {
      action: fieldMap.action,
      unique: fieldMap.unique
    };
  });
  return formatted;
};
var isMutationType = function isMutationType(definition) {
  return definition.kind === "ObjectTypeDefinition" && definition.name.value === "Mutation";
};
var cleanCypherStatement = function cleanCypherStatement(directive) {
  var args = directive.arguments;
  args.forEach(function (arg) {
    if (arg.name && arg.name.value === "statement" && arg.value.block === true) {
      arg.value.block = false;
      arg.value.value = arg.value.value.replace(/\n/g, " ");
    }
  });
  return args;
};
var cleanCypherStatements = function cleanCypherStatements(typeDefs) {
  var parsed = (0, _graphql.parse)(typeDefs);
  var operationMaps = (0, _typedefs.buildOperationMap)(parsed);
  var typeMaps = (0, _typedefs.buildTypeMaps)(parsed);
  var models = typeMaps.models;
  var mutations = operationMaps.mutations;
  if (mutations) {
    var mutationsIndex = mutations.index;
    var cleanedFields = [];
    Object.keys(mutations.fieldMap).forEach(function (mutationName) {
      mutations.fieldMap[mutationName].directives.forEach(function (directive) {
        if (directive.name.value === "cypher") {
          directive.arguments = cleanCypherStatement(directive);
        }
      });
      cleanedFields.push(mutations.fieldMap[mutationName]);
    });
    parsed.definitions[mutationsIndex].fields = cleanedFields;
  }

  var queries = operationMaps.queries;
  if (queries) {
    var queriesIndex = queries.index;
    var _cleanedFields = [];
    Object.keys(queries.fieldMap).forEach(function (queryName) {
      queries.fieldMap[queryName].directives.forEach(function (directive) {
        if (directive.name.value === "cypher") {
          directive.arguments = cleanCypherStatement(directive);
        }
      });
      _cleanedFields.push(queries.fieldMap[queryName]);
    });
    parsed.definitions[queriesIndex].fields = _cleanedFields;
  }

  if (models) {
    var _cleanedFields2 = [];
    var model = {};
    var directives = [];
    Object.keys(models).forEach(function (modelName) {
      model = models[modelName];
      model.def.fields.forEach(function (field) {
        field.directives.forEach(function (directive) {
          if (directive.name.value === "cypher") {
            directive.arguments = cleanCypherStatement(directive);
          } else if (directive.name.value === "unique") {
            // For now, change @unique to @isUnique
            directive.name.value = "isUnique";
          }
        });
      });
      parsed.definitions[model.index].fields = model.def.fields;
    });
  }
  return (0, _graphql.print)(parsed);
};
var logAssertionResult = function logAssertionResult(result) {
  console.log('\n--- BEGIN neo4jAssertConstraints ---\n' + JSON.stringify(formatAssertionResult(result), null, 2) + '\n--- END neo4jAssertConstraints ---\n  ');
};
var logIDLResult = function logIDLResult(result) {
  console.log('\n--- BEGIN neo4jIDL ---\n' + result.records[0]._fields[0] + '\n--- END neo4jIDL ---\n  ');
};