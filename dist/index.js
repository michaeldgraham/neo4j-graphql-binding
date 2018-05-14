'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.neo4jIDL = exports.neo4jExecute = exports.neo4jGraphQLBinding = exports.neo4jGraphqlBinding = exports.buildNeo4jTypeDefs = undefined;

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _typedefs = require('./typedefs.js');

var _binding = require('./binding.js');

var _graphql = require('graphql');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

var buildNeo4jTypeDefs = exports.buildNeo4jTypeDefs = _typedefs.buildTypeDefs;
var neo4jGraphqlBinding = exports.neo4jGraphqlBinding = _binding.Neo4jGraphQLBinding;
var neo4jGraphQLBinding = exports.neo4jGraphQLBinding = function neo4jGraphQLBinding(_ref) {
  var typeDefs = _ref.typeDefs,
      driver = _ref.driver,
      log = _ref.log;

  log = typeof log === 'boolean' ? log : false;
  return new _binding.Neo4jGraphQLBinding({
    typeDefs: typeDefs,
    driver: driver,
    log: log
  });
};
var neo4jExecute = exports.neo4jExecute = function neo4jExecute(params, ctx, info) {
  switch (info.parentType.name) {
    case "Mutation":
      {
        ctx.operationName = info.fieldName;
        return ctx.neo4j.mutation[info.fieldName](params, info, {
          context: ctx
        });
      }
    case "Query":
      {
        ctx.operationName = info.fieldName;
        return ctx.neo4j.query[info.fieldName](params, info, {
          context: ctx
        });
      }
    case 'Subscription':
      {
        throw Error('Subscriptions not yet supported by neo4j-graphql-binding');
      }
  }
  throw Error('Unsupported value for parentType.name');
};
var neo4jIDL = exports.neo4jIDL = function () {
  var _ref2 = _asyncToGenerator( /*#__PURE__*/_regenerator2.default.mark(function _callee(driver, typeDefs) {
    var session;
    return _regenerator2.default.wrap(function _callee$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            if (!(driver && typeDefs)) {
              _context.next = 5;
              break;
            }

            session = driver.session();
            _context.next = 4;
            return session.run('CALL graphql.idl({schema})', { schema: oneLineBlockCypherStatements(typeDefs) }).then(function (result) {
              session.close();
              return result.records[0]._fields[0];
            }).catch(function (error) {
              console.error(error);
            });

          case 4:
            return _context.abrupt('return', _context.sent);

          case 5:
          case 'end':
            return _context.stop();
        }
      }
    }, _callee, undefined);
  }));

  return function neo4jIDL(_x, _x2) {
    return _ref2.apply(this, arguments);
  };
}();

var isMutationType = function isMutationType(definition) {
  return definition.kind === "ObjectTypeDefinition" && definition.name.value === "Mutation";
};
var cleanCypherStatement = function cleanCypherStatement(args) {
  var len = args ? args.length : 0;
  var a = 0;
  var arg = {};
  var statement = "";
  for (; a < len; ++a) {
    arg = args[a];
    if (arg.name && arg.name.value === "statement" && arg.value.block === true) {
      arg.value.block = false;
      arg.value.value = arg.value.value.replace(/\n/g, " ");
    }
  }
  return args;
};
var oneLineBlockCypherStatements = function oneLineBlockCypherStatements(typeDefs) {
  var parsed = (0, _graphql.parse)(typeDefs);
  var mutationTypeInfo = getMutationTypeInfo(parsed, typeDefs);
  var mutations = mutationTypeInfo.fields;
  var mutationsIndex = mutationTypeInfo.index;
  var directives = [];
  var d = 0;
  var len = 0;
  var directive = {};
  var dirArguments = [];
  var statement = "";
  var cleanedMutations = mutations.map(function (obj) {
    directives = obj.directives;
    len = directives.length;
    for (d = 0; d < len; ++d) {
      directive = directives[d];
      if (directive.name.value === "cypher") {
        dirArguments = directive.arguments;
        directive.arguments = cleanCypherStatement(dirArguments);
      }
    }
    return obj;
  });
  parsed.definitions[mutationsIndex].fields = cleanedMutations;
  return (0, _graphql.print)(parsed);
};
var getMutationTypeInfo = function getMutationTypeInfo(parsed, typeDefs) {
  if (parsed.kind === "Document") {
    var defs = parsed.definitions;
    var len = defs.length;
    var d = 0;
    var def = {};
    var defFields = [];
    for (; d < len; ++d) {
      def = defs[d];
      if (isMutationType(def)) {
        return {
          fields: def.fields,
          index: d
        };
      }
    }
  }
  return {};
};