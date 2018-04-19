'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.neo4jExecute = exports.neo4jGraphQLBinding = undefined;

var _graphql = require('graphql');

var _graphqlBinding = require('graphql-binding');

var _apolloLink = require('apollo-link');

var _graphqlTools = require('graphql-tools');

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

var neo4jExecute = exports.neo4jExecute = function neo4jExecute(params, ctx, info) {
  switch (info.parentType.name) {
    case "Mutation":
      {
        return neo4jMutation(params, ctx, info);
      }
    case "Query":
      {
        return neo4jQuery(params, ctx, info);
      }
    case 'Subscription':
      {
        throw Error('Subscriptions not yet supported by neo4j-graphql-binding');
      }
  }
  throw Error('Unsupported value for parentType.name');
};

var neo4jMutation = function neo4jMutation(params, ctx, info) {
  return ctx.neo4j.mutation[info.fieldName](params, ctx, info);
};

var neo4jQuery = function neo4jQuery(params, ctx, info) {
  return ctx.neo4j.query[info.fieldName](params, ctx, info);
};

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

var neo4jGraphqlIdl = function neo4jGraphqlIdl(driver, schema) {
  var session = driver.session();
  session.run('CALL graphql.idl({schema})', { schema: schema }).then(function (result) {
    session.close();
  }).catch(function (error) {
    console.error(error);
  });
};

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
