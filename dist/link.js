'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.neo4jGraphqlLink = undefined;

var _apolloLink = require('apollo-link');

var _graphql = require('graphql');

var neo4jGraphqlLink = exports.neo4jGraphqlLink = function neo4jGraphqlLink(driver) {
  return new _apolloLink.ApolloLink(function (operation, forward) {
    var ctx = operation.getContext().graphqlContext;
    var localInfo = ctx.localInfo;
    var logRequests = ctx.logRequests;
    return new _apolloLink.Observable(function (observer) {
      var usedVariables = getUsedOperationVariables(operation, localInfo);
      switchVariableDefinitions(operation, usedVariables);
      switchArguments(operation, localInfo);
      switch (ctx.requestType) {
        case 'query':
          {
            return neo4jGraphqlQuery(driver, observer, operation, logRequests);
          }
        case 'mutation':
          {
            return neo4jGraphqlExecute(driver, observer, operation, logRequests);
          }
        default:
          {
            throw Error("neo4jGraphqlLink Error: Request type " + ctx.requestType + " is not supported.");
          }
      }
    });
  });
};

var switchVariableDefinitions = function switchVariableDefinitions(operation, usedVariables) {
  operation.query.definitions[0].variableDefinitions = usedVariables;
};
var switchArguments = function switchArguments(operation, localInfo) {
  operation.query.definitions[0].selectionSet.selections[0].arguments = localInfo.fieldNodes[0].arguments;
};
var cleanVariables = function cleanVariables(operation) {
  operation.query.definitions[0].variableDefinitions = [];
};
var getUsedOperationVariables = function getUsedOperationVariables(operation, localInfo) {
  var usedVariables = [];
  var allVariables = localInfo.operation.variableDefinitions;
  switchArguments(operation, localInfo);
  cleanVariables(operation);
  var printedOnlyArguments = (0, _graphql.print)(operation.query);
  var v = 0;
  var len = allVariables.length;
  var variable = {};
  var name = "";
  for (; v < len; ++v) {
    variable = allVariables[v];
    if (variable.kind === "VariableDefinition") {
      name = variable.variable.name.value;
      if (printedOnlyArguments.includes('$' + name)) {
        usedVariables.push(variable);
      }
    }
  }
  return usedVariables;
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
var neo4jGraphqlQuery = function neo4jGraphqlQuery(driver, observer, operation, logRequests) {
  var session = driver.session();
  var request = (0, _graphql.print)(operation.query);
  if (logRequests === true) {
    console.log('neo4jGraphqlQuery sending request\n' + request + ' with variables\n', operation.variables);
  }
  session.run('CALL graphql.query("' + request + '", {' + transformVariables(operation.variables) + '})', operation.variables).then(function (result) {
    session.close();
    observer.next({
      data: result.records[0]._fields[0]
    });
    observer.complete();
  }).catch(function (error) {
    observer.error(error);
  });
};
var neo4jGraphqlExecute = function neo4jGraphqlExecute(driver, observer, operation, logRequests) {
  var session = driver.session();
  var request = (0, _graphql.print)(operation.query);
  if (logRequests === true) {
    console.log('neo4jGraphqlQuery sending request:\n' + request + ' with variables:\n', operation.variables);
  }
  session.run('CALL graphql.execute("' + request + '", {' + transformVariables(operation.variables) + '})', operation.variables).then(function (result) {
    session.close();
    observer.next({
      data: result.records[0]._fields[0]
    });
    observer.complete();
  }).catch(function (error) {
    observer.error(error);
  });
};