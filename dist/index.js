'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.neo4jExecute = exports.neo4jGraphQLBinding = undefined;

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _crossFetch = require('cross-fetch');

var _crossFetch2 = _interopRequireDefault(_crossFetch);

var _graphql = require('graphql');

var _graphqlBinding = require('graphql-binding');

var _apolloLinkHttp = require('apollo-link-http');

var _apolloLink = require('apollo-link');

var _graphqlTools = require('graphql-tools');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

var neo4jGraphQLBinding = exports.neo4jGraphQLBinding = function neo4jGraphQLBinding(opt) {
  var driver = opt.driver,
      typeDefs = opt.typeDefs;

  neo4jGraphqlIdl(driver, typeDefs);
  var neo4jSchema = (0, _graphqlTools.makeRemoteExecutableSchema)({
    schema: typeDefs,
    link: neo4jGraphqlLink(driver)
  });
  return new _graphqlBinding.Binding({
    schema: neo4jSchema
  });
};

var neo4jExecute = exports.neo4jExecute = function () {
  var _ref = _asyncToGenerator( /*#__PURE__*/_regenerator2.default.mark(function _callee(params, ctx, info) {
    return _regenerator2.default.wrap(function _callee$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            _context.t0 = info.parentType.name;
            _context.next = _context.t0 === "Mutation" ? 3 : _context.t0 === "Query" ? 6 : _context.t0 === 'Subscription' ? 9 : 10;
            break;

          case 3:
            _context.next = 5;
            return neo4jMutation(params, ctx, info);

          case 5:
            return _context.abrupt('return', _context.sent);

          case 6:
            _context.next = 8;
            return neo4jQuery(params, ctx, info);

          case 8:
            return _context.abrupt('return', _context.sent);

          case 9:
            throw Error('Subscriptions not yet supported by neo4j-graphql-binding');

          case 10:
            throw Error('Unsupported value for parentType.name');

          case 11:
          case 'end':
            return _context.stop();
        }
      }
    }, _callee, undefined);
  }));

  return function neo4jExecute(_x, _x2, _x3) {
    return _ref.apply(this, arguments);
  };
}();

var neo4jMutation = function () {
  var _ref2 = _asyncToGenerator( /*#__PURE__*/_regenerator2.default.mark(function _callee2(params, ctx, info) {
    return _regenerator2.default.wrap(function _callee2$(_context2) {
      while (1) {
        switch (_context2.prev = _context2.next) {
          case 0:
            _context2.next = 2;
            return ctx.neo4j.mutation[info.fieldName](params, ctx, info);

          case 2:
            return _context2.abrupt('return', _context2.sent);

          case 3:
          case 'end':
            return _context2.stop();
        }
      }
    }, _callee2, undefined);
  }));

  return function neo4jMutation(_x4, _x5, _x6) {
    return _ref2.apply(this, arguments);
  };
}();

var neo4jQuery = function () {
  var _ref3 = _asyncToGenerator( /*#__PURE__*/_regenerator2.default.mark(function _callee3(params, ctx, info) {
    return _regenerator2.default.wrap(function _callee3$(_context3) {
      while (1) {
        switch (_context3.prev = _context3.next) {
          case 0:
            _context3.next = 2;
            return ctx.neo4j.query[info.fieldName](params, ctx, info);

          case 2:
            return _context3.abrupt('return', _context3.sent);

          case 3:
          case 'end':
            return _context3.stop();
        }
      }
    }, _callee3, undefined);
  }));

  return function neo4jQuery(_x7, _x8, _x9) {
    return _ref3.apply(this, arguments);
  };
}();

var neo4jGraphqlLink = function neo4jGraphqlLink(driver) {
  return new _apolloLink.ApolloLink(function (operation, forward) {
    return new _apolloLink.Observable(function (observer) {
      return neo4jGraphqlRequest(driver, observer, operation);
    });
  });
};

var transformVariables = function transformVariables(params) {
  var transformed = [];
  var transformedParam = "";
  var param = '';
  var p = 0;
  var keys = Object.keys(params);
  var len = keys.length;
  for (; p < len; ++p) {
    param = keys[p];
    transformed.push(param + ': {' + param + '}');
  }
  return transformed.join(',\n');
};

var neo4jGraphqlIdl = function () {
  var _ref4 = _asyncToGenerator( /*#__PURE__*/_regenerator2.default.mark(function _callee4(driver, schema) {
    var session;
    return _regenerator2.default.wrap(function _callee4$(_context4) {
      while (1) {
        switch (_context4.prev = _context4.next) {
          case 0:
            session = driver.session();
            _context4.next = 3;
            return session.run('CALL graphql.idl({schema})', { schema: schema }).then(function (result) {
              session.close();
            }).catch(function (error) {
              console.error(error);
            });

          case 3:
          case 'end':
            return _context4.stop();
        }
      }
    }, _callee4, undefined);
  }));

  return function neo4jGraphqlIdl(_x10, _x11) {
    return _ref4.apply(this, arguments);
  };
}();

var neo4jGraphqlRequest = function neo4jGraphqlRequest(driver, observer, operation) {
  var session = driver.session();
  session.run('CALL graphql.execute("' + (0, _graphql.print)(operation.query) + '", {' + transformVariables(operation.variables) + '})', operation.variables).then(function (result) {
    session.close();
    observer.next({
      data: result.records[0]._fields[0]
    });
    observer.complete();
  }).catch(function (error) {
    observer.error(error);
  });
};
