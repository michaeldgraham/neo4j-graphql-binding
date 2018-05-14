import { Binding } from 'graphql-binding';
import { makeRemoteExecutableSchema } from 'graphql-tools';
import { neo4jGraphQLLink } from './link.js';

export const Neo4jGraphQLBinding = class Neo4jGraphQLBinding extends Binding {
  constructor({ typeDefs, driver, log }) {
    super({
      schema: makeRemoteExecutableSchema({
        schema: typeDefs,
        link: neo4jGraphQLLink(typeDefs, driver, log)
      })
    });
  };
};
