import { ApolloLink, Observable } from 'apollo-link';
import { print } from 'graphql';

export const neo4jGraphQLLink = (typeDefs, driver, log) => {
  return new ApolloLink((operation, forward) => {
    const ctx = operation.getContext().graphqlContext;
    const operationType = operation.query.definitions[0].operation;
    const operationName = ctx.operationName;
    return new Observable(observer => {
      switch(operationType) {
        case 'query': {
          return neo4jGraphqlQuery(operationType, operationName, driver, observer, operation, log);
        }
        case 'mutation': {
          return neo4jGraphqlExecute(operationType, operationName, driver, observer, operation, log);
        }
        default: {
          throw Error("neo4jGraphqlLink Error: Request type "+operationType+" is not supported.");
        }
      }
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
const neo4jGraphqlQuery = (operationType, operationName, driver, observer, operation, logRequests) => {
  const session = driver.session();
  const queryAST = operation.query;
  const variables = operation.variables;
  const request = print(queryAST);
  if(logRequests === true) {
    console.log(`neo4jGraphqlQuery sending request:\n${request} with variables:\n`, variables);
  }
  session.run(`CALL graphql.query('${request}', {${transformVariables(variables)}})`, variables)
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
const neo4jGraphqlExecute = (operationType, operationName, driver, observer, operation, logRequests) => {
  const session = driver.session();
  const queryAST = operation.query;
  const variables = operation.variables;
  const request = print(queryAST);
  if(logRequests === true) {
    console.log(`neo4jGraphqlExecute sending request:\n${request} with variables:\n`, variables);
  }
  session.run(`CALL graphql.execute('${request}', {${transformVariables(variables)}})`, variables)
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
