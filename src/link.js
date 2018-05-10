import { ApolloLink, Observable } from 'apollo-link';
import { print } from 'graphql';

export const neo4jGraphqlLink = (driver) => {
  return new ApolloLink((operation, forward) => {
    const ctx = operation.getContext().graphqlContext;
    const localInfo = ctx.localInfo;
    const logRequests = ctx.logRequests;
    return new Observable(observer => {
      const usedVariables = getUsedOperationVariables(operation, localInfo);
      switchVariableDefinitions(operation, usedVariables);
      switchArguments(operation, localInfo);
      switch(ctx.requestType) {
        case 'query': {
          return neo4jGraphqlQuery(driver, observer, operation, logRequests);
        }
        case 'mutation': {
          return neo4jGraphqlExecute(driver, observer, operation, logRequests);
        }
        default: {
          throw Error("neo4jGraphqlLink Error: Request type "+ctx.requestType+" is not supported.");
        }
      }
    });
  });
};

const switchVariableDefinitions = (operation, usedVariables) => {
  operation.query.definitions[0].variableDefinitions = usedVariables;
};
const switchArguments = (operation, localInfo) => {
  operation.query.definitions[0].selectionSet.selections[0].arguments = localInfo.fieldNodes[0].arguments;
};
const cleanVariables = (operation) => {
  operation.query.definitions[0].variableDefinitions = [];
};
const getUsedOperationVariables = (operation, localInfo) => {
  const usedVariables = [];
  const allVariables = localInfo.operation.variableDefinitions;
  switchArguments(operation, localInfo);
  cleanVariables(operation);
  const printedOnlyArguments = print(operation.query);
  let v = 0;
  const len = allVariables.length;
  let variable = {};
  let name = "";
  for(; v < len; ++v) {
    variable = allVariables[v];
    if(variable.kind === "VariableDefinition") {
      name = variable.variable.name.value;
      if(printedOnlyArguments.includes(`$${name}`)) {
        usedVariables.push(variable);
      }
    }
  }
  return usedVariables;
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
const neo4jGraphqlQuery = (driver, observer, operation, logRequests) => {
  const session = driver.session();
  const request = print(operation.query);
  if(logRequests === true) {
    console.log(`neo4jGraphqlQuery sending request\n${request} with variables\n`, operation.variables);
  }
  session.run(`CALL graphql.query('${request}', {${transformVariables(operation.variables)}})`, operation.variables)
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
const neo4jGraphqlExecute = (driver, observer, operation, logRequests) => {
  const session = driver.session();
  const request = print(operation.query);
  if(logRequests === true) {
    console.log(`neo4jGraphqlQuery sending request:\n${request} with variables:\n`, operation.variables);
  }
  session.run(`CALL graphql.execute('${request}', {${transformVariables(operation.variables)}})`, operation.variables)
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
