import { makeRemoteExecutableSchema } from 'graphql-tools';
import { Binding  } from 'graphql-binding';
import { buildBindings } from './binding.js';
import { buildTypeDefs } from './typedefs.js';
import { neo4jGraphqlLink } from './link.js';

export const buildNeo4jTypeDefs = buildTypeDefs;
export const neo4jGraphQLBinding = ({ typeDefs, driver, log }) => {
  const logRequests = typeof log === "boolean" ? log : false;
  const neo4jSchema = makeRemoteExecutableSchema({
    schema: typeDefs,
    link: neo4jGraphqlLink(driver)
  });
  const binding = new Binding({
    schema: neo4jSchema
  });
  const bindingWrappers = buildBindings({
    typeDefs: typeDefs,
    binding: binding,
    log: log
  });
  return bindingWrappers;
};
export const neo4jExecute = (params, ctx, info) => {
  switch(info.parentType.name) {
    case "Mutation": {
      return ctx.neo4j.mutation[info.fieldName](params, ctx, info);
    }
    case "Query": {
      return ctx.neo4j.query[info.fieldName](params, ctx, info);
    }
    case 'Subscription': {
      throw Error(`Subscriptions not yet supported by neo4j-graphql-binding`);
    }
  }
  throw Error(`Unsupported value for parentType.name`);
}
export const neo4jIDL = async (driver, schema) => {
  const session = driver.session();
  return await session
    .run('CALL graphql.idl({schema})', {schema: schema})
    .then(function (result) {
      session.close();
      return result.records[0]._fields[0]
    })
    .catch(function (error) {
      console.error(error);
    });
};
