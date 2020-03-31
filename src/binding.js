const{ Binding } = require('graphql-binding');
const { makeRemoteExecutableSchema } = require('graphql-tools');
const { neo4jGraphQLLink } = require('./link.js');

exports.Neo4jGraphQLBinding = class Neo4jGraphQLBinding extends Binding {
  constructor({ typeDefs, driver, log, indexConfig }) {
    super({
      schema: makeRemoteExecutableSchema({
        schema: typeDefs,
        link: neo4jGraphQLLink({
          typeDefs: typeDefs,
          driver: driver,
          log: log,
          indexConfig: indexConfig
        })
      })
    });
  };
};
