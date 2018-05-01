'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.neo4jIDL = exports.neo4jExecute = exports.neo4jGraphQLBinding = exports.buildNeo4jTypeDefs = undefined;

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _graphqlTools = require('graphql-tools');

var _graphqlBinding = require('graphql-binding');

var _binding = require('./binding.js');

var _typedefs = require('./typedefs.js');

var _link = require('./link.js');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

var buildNeo4jTypeDefs = exports.buildNeo4jTypeDefs = _typedefs.buildTypeDefs;
var neo4jGraphQLBinding = exports.neo4jGraphQLBinding = function neo4jGraphQLBinding(_ref) {
  var typeDefs = _ref.typeDefs,
      driver = _ref.driver,
      log = _ref.log;

  var logRequests = typeof log === "boolean" ? log : false;
  var neo4jSchema = (0, _graphqlTools.makeRemoteExecutableSchema)({
    schema: typeDefs,
    link: (0, _link.neo4jGraphqlLink)(driver)
  });
  var binding = new _graphqlBinding.Binding({
    schema: neo4jSchema
  });
  var bindingWrappers = (0, _binding.buildBindings)({
    typeDefs: typeDefs,
    binding: binding,
    log: log
  });
  return bindingWrappers;
};
var neo4jExecute = exports.neo4jExecute = function neo4jExecute(params, ctx, info) {
  switch (info.parentType.name) {
    case "Mutation":
      {
        return ctx.neo4j.mutation[info.fieldName](params, ctx, info);
      }
    case "Query":
      {
        return ctx.neo4j.query[info.fieldName](params, ctx, info);
      }
    case 'Subscription':
      {
        throw Error('Subscriptions not yet supported by neo4j-graphql-binding');
      }
  }
  throw Error('Unsupported value for parentType.name');
};
var neo4jIDL = exports.neo4jIDL = function () {
  var _ref2 = _asyncToGenerator( /*#__PURE__*/_regenerator2.default.mark(function _callee(driver, schema) {
    var session;
    return _regenerator2.default.wrap(function _callee$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            session = driver.session();
            _context.next = 3;
            return session.run('CALL graphql.idl({schema})', { schema: schema }).then(function (result) {
              session.close();
              return result.records[0]._fields[0];
            }).catch(function (error) {
              console.error(error);
            });

          case 3:
            return _context.abrupt('return', _context.sent);

          case 4:
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
