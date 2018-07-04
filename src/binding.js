import { Binding } from 'graphql-binding';
import { makeRemoteExecutableSchema } from 'graphql-tools';
import { neo4jGraphQLLink } from './link.js';
import { buildTypeDefs } from './typedefs.js';

export const Neo4jGraphQLBinding = class Neo4jGraphQLBinding extends Binding {
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
