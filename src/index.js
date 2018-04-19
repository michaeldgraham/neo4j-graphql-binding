import { print } from 'graphql';
import { Binding  } from 'graphql-binding';
import { ApolloLink, Observable } from 'apollo-link';
import { makeRemoteExecutableSchema } from 'graphql-tools';

export const neo4jGraphQLBinding = (opt) => {
  const { driver, typeDefs } = opt;
  neo4jGraphqlIdl(driver, typeDefs);
  const neo4jSchema = makeRemoteExecutableSchema({
    schema: typeDefs,
    link: neo4jGraphqlLink(driver)
  });
  return new Binding({
    schema: neo4jSchema
  });
};

export const neo4jExecute = (params, ctx, info) => {
  switch(info.parentType.name) {
    case "Mutation": {
      return neo4jMutation(params, ctx, info);
    }
    case "Query": {
      return neo4jQuery(params, ctx, info);
    }
    case 'Subscription': {
      throw Error(`Subscriptions not yet supported by neo4j-graphql-binding`);
    }
  }
  throw Error(`Unsupported value for parentType.name`);
}

const neo4jMutation = (params, ctx, info) => {
  return ctx.neo4j.mutation[info.fieldName](params, ctx, info);
}

const neo4jQuery = (params, ctx, info) => {
  return ctx.neo4j.query[info.fieldName](params, ctx, info);
}

const neo4jGraphqlLink = (driver) => {
  return new ApolloLink((operation, forward) => {
    return new Observable(observer => {
      return neo4jGraphqlRequest(driver, observer, operation);
    });
  });
};

const transformVariables = (params) => {
  let transformed = [];
  let transformedParam = "";
  let param = '';
  let p = 0;
  const keys = Object.keys(params);
  const len = keys.length;
  for(; p < len; ++p) {
    param = keys[p];
    transformed.push(`${param}: {${param}}`);
  }
  return transformed.join(',\n');
};

const neo4jGraphqlIdl = (driver, schema) => {
  const session = driver.session();
  session
    .run('CALL graphql.idl({schema})', {schema: schema})
    .then(function (result) {
      session.close();
    })
    .catch(function (error) {
      console.error(error);
    });
};

const neo4jGraphqlRequest = (driver, observer, operation) => {
  const session = driver.session();
  session.run(`CALL graphql.execute("${print(operation.query)}", {${transformVariables(operation.variables)}})`, operation.variables)
  .then(result => {
    session.close();
    observer.next({
      data: result.records[0]._fields[0]
    });
    observer.complete();
  })
  .catch(error => {
    observer.error(error);
  });
};
