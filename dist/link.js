'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.neo4jGraphQLLink = undefined;

var _apolloLink = require('apollo-link');

var _graphql = require('graphql');

var neo4jGraphQLLink = exports.neo4jGraphQLLink = function neo4jGraphQLLink(typeDefs, driver, log) {
  return new _apolloLink.ApolloLink(function (operation, forward) {
    var ctx = operation.getContext().graphqlContext;
    var operationType = operation.query.definitions[0].operation;
    var operationName = ctx.operationName;
    return new _apolloLink.Observable(function (observer) {
      switch (operationType) {
        case 'query':
          {
            return neo4jGraphqlQuery(operationType, operationName, driver, observer, operation, log);
          }
        case 'mutation':
          {
            return neo4jGraphqlExecute(operationType, operationName, driver, observer, operation, log);
          }
        default:
          {
            throw Error("neo4jGraphqlLink Error: Request type " + operationType + " is not supported.");
          }
      }
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
var neo4jGraphqlQuery = function neo4jGraphqlQuery(operationType, operationName, driver, observer, operation, logRequests) {
  var session = driver.session();
  var queryAST = operation.query;
  var variables = operation.variables;
  var request = (0, _graphql.print)(queryAST);
  if (logRequests === true) {
    console.log('neo4jGraphqlQuery sending request:\n' + request + ' with variables:\n', variables);
  }
  session.run('CALL graphql.query(\'' + request + '\', {' + transformVariables(variables) + '})', variables).then(function (result) {
    session.close();
    observer.next({
      data: result.records[0]._fields[0]
    });
    observer.complete();
  }).catch(function (error) {
    observer.error(error);
  });
};
var neo4jGraphqlExecute = function neo4jGraphqlExecute(operationType, operationName, driver, observer, operation, logRequests) {
  var session = driver.session();
  var queryAST = operation.query;
  var variables = operation.variables;
  var request = (0, _graphql.print)(queryAST);
  if (logRequests === true) {
    console.log('neo4jGraphqlExecute sending request:\n' + request + ' with variables:\n', variables);
  }
  session.run('CALL graphql.execute(\'' + request + '\', {' + transformVariables(variables) + '})', variables).then(function (result) {
    session.close();
    observer.next({
      data: result.records[0]._fields[0]
    });
    observer.complete();
  }).catch(function (error) {
    observer.error(error);
  });
};