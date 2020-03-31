const { ApolloLink, Observable } = require('apollo-link');
const { print, parse } = require('graphql');
const { buildTypeMaps, buildOperationMap, getFieldType } = require('./typedefs.js');
const cuid = require('cuid');

exports.neo4jGraphQLLink = ({ typeDefs, driver, log=false, indexConfig }) => {
  const parsed = parse(typeDefs);
  const generatedMutations = getGeneratedMutations(parsed);
  const modelMap = buildModelMap(parsed);
  const mutationMap = buildMutationMap(parsed, modelMap, generatedMutations);
  return new ApolloLink((operation, forward) => {
    const type = getOperationType(operation);
    return new Observable(observer => {
      switch(type) {
        case 'query': {
          return neo4jGraphqlQuery(type, driver, observer, operation, log);
        }
        case 'mutation': {
          return neo4jGraphqlExecute(type, driver, observer, operation, log, indexConfig, generatedMutations, mutationMap, modelMap);
        }
        default: {
          throw Error("neo4jGraphqlLink Error: Request type "+type+" is not supported.");
        }
      }
    });
  });
};
exports.getModelFieldMaps = (fields) => {
  let relationMap = {};
  let propertyMap = {};
  let listMap = {};
  let uniqueProperties = [];
  let fieldType = undefined;
  let fieldName = "";
  fields.forEach(field => {
    fieldName = field.name.value;
    fieldType = getFieldType(field);
    if(fieldName !== undefined && fieldType !== undefined) {
      if(isRelation(field)) {
        if(fieldType) relationMap[fieldName] = fieldType;
        if(isListType(field)) listMap[fieldName] = true;
      }
      else {
        if(!hasDirective(field, "cypher")) {
          if(fieldType) propertyMap[fieldName] = fieldType;
          if(hasDirective(field, "unique") || hasDirective(field, "isUnique") || fieldName === "id") uniqueProperties.push(fieldName);
        }
      }
    }
  });
  return {
    relationMap: relationMap,
    propertyMap: propertyMap,
    uniqueProperties: uniqueProperties,
    listMap: listMap
  };
}

const getOperationType = (operation) => {
  // After the binding delegates, the operation definition
  // is reduced to be only that of the delegated operation,
  // so we can trust that there is only one and access it
  // at .definitions[0]
  return operation.query.definitions[0].operation;
}

const neo4jGraphqlQuery = (operationType, driver, observer, operation, logRequests) => {
  const session = driver.session();
  const queryAST = operation.query;
  const request = print(queryAST);
  const variables = operation.variables;
  if(logRequests) {
    logRequest({
      cypher: request,
      variables: variables
    });
  }
  session.run(`CALL graphql.query('${request}', {${transformVariables(variables)}})`, variables)
  .then(result => {
    session.close();
    const data = result.records[0]._fields[0];
    if(logRequests) logResponse(data);
    observer.next({ data: data });
    observer.complete();
  })
  .catch(error => {
    observer.error(error);
  });
};
const neo4jGraphqlExecute = (operationType, driver, observer, operation, logRequests, indexConfig, generatedMutations, mutationMap, modelMap) => {
  const session = driver.session();
  const mutationName = getMutationNameFromOperation(operation);
  const variables = operation.variables;
  const operationQueryAST = operation.query;
  const operationQuery = print(operationQueryAST);
  const request = buildMutationRequest({
    mutationName: mutationName,
    operation: operation,
    indexConfig: indexConfig,
    variables: variables,
    generatedMutations: generatedMutations,
    mutationMap: mutationMap,
    modelMap: modelMap,
    operationQuery: operationQuery
  });
  if(logRequests) logRequest(request);
  session.run(request.cypher, request.variables)
  .then(result => {
    session.close();
    observer.next(formatResult({
      mutationType: request.mutationType,
      modelMap: modelMap,
      variables: request.variables.variables,
      modelType: request.rootModelType,
      mutationName: mutationName,
      generatedMutations: generatedMutations,
      result: result,
      logRequests: logRequests
    }));
    observer.complete();
  })
  .catch(error => {
    observer.error(error);
  });
};
const buildNestedMutationCall = ({
  rootModelType,
  rootFieldName,
  mutation,
  fieldPath,
  modelType,
  relatedModelType,
  mutationType,
  parentElementName,
  mutationName,
  mutationID, fieldName,
  alreadyGenerated,
  batch
}) => {
  switch(mutationType) {
    case "create": {
      return `
WITH COUNT(*) AS SCOPE
${buildUnwindStatements({
  rootModelType: rootModelType,
  rootFieldName: rootFieldName,
  modelType: modelType,
  fieldPath: fieldPath
})}
CALL graphql.execute('${mutation}', ${mutationID}) YIELD result AS ${mutationType}${mutationID}Result
      `;
    }
  }
};
const buildRelationMutationCall = ({
  fieldName,
  mutationID,
  variables,
  modelType,
  modelMap,
  relationMutationType,
  mutationType,
  parentElementName,
  mutationMap,
  alreadyGenerated,
  fieldPath,
  rootModelType,
  rootFieldName
}) => {
  const mutationName = `${relationMutationType}${modelType}${capitalizeName(fieldName)}`;
  const relationMutationInfo = mutationMap[mutationName];
  const relationMutation = relationMutationInfo.cypher;
  const relationModelType = getRelatedModelType({
    modelMap: modelMap,
    modelType: modelType,
    fieldName: fieldName
  });
  const uniqueFields = getModelUniqueProperties({
    modelType: modelType,
    modelMap: modelMap
  });
  const uniqueRelationFields = getModelUniqueProperties({
    modelType: relationModelType,
    modelMap: modelMap
  });
  switch(mutationType) {
    case "create": {
      switch(relationMutationType) {
        case "add": {
          if(parentElementName === undefined) {
            return `CALL graphql.execute('${relationMutation}', { where: { ${transformVariableList(variables, uniqueFields)} }, ${fieldName}: [{${transformVariableList(variables, uniqueRelationFields, mutationID)}}] }) YIELD result AS ${mutationName}${mutationID}Result`;
          }
          return `CALL graphql.execute('${relationMutation}', { where: { ${transformVariableList(variables, uniqueFields, parentElementName)} }, ${fieldName}: [{${transformVariableList(variables, uniqueRelationFields, mutationID)}}] }) YIELD result AS ${mutationName}${mutationID}Result`;
        }
        default: {
          break;
        }
      }
      break;
    }
    case "connect": {
      switch(relationMutationType) {
        case "add": {
          if(parentElementName === undefined) {
            return `
WITH COUNT(*) AS SCOPE
${buildUnwindStatements({
  rootModelType: rootModelType,
  rootFieldName: rootFieldName,
  modelType: modelType,
  fieldPath: fieldPath
})}
CALL graphql.execute('${relationMutation}', { where: { ${transformVariableList(variables, uniqueFields)} }, ${fieldName}: [{${transformVariableList(variables, uniqueRelationFields, mutationID)}}] }) YIELD result AS ${mutationName}${mutationID}Result`;
          }
          return `
WITH COUNT(*) AS SCOPE
${buildUnwindStatements({
  rootModelType: rootModelType,
  rootFieldName: rootFieldName,
  modelType: modelType,
  fieldPath: fieldPath
})}
CALL graphql.execute('${relationMutation}', { where: { ${transformVariableList(variables, uniqueFields, parentElementName)} }, ${fieldName}: [{${transformVariableList(variables, uniqueRelationFields, mutationID)}}] }) YIELD result AS ${mutationName}${mutationID}Result`;
        }
        default: { break; }
      }
      break;
    }
    default: { break; }
  }
};
const buildReturnQueryStatements = (uniqueVariableMap, modelMap) => {
  const statements = [];
  let returnStatements = [];
  let uniqueFields = [];
  let progressiveWith = [];
  Object.keys(uniqueVariableMap).forEach(modelName => {
    // There will be at least the id field for every model
    uniqueFields = modelMap[modelName].uniqueProperties;
    returnStatements.push(`${modelName}: ALL_${modelName}`);
    statements.push(`
UNWIND {${modelName}} AS _${modelName}
MATCH (${modelName}Node: ${modelName}) WHERE ${uniqueFieldComparisonDisjunction(modelName, uniqueFields)}
WITH COLLECT(DISTINCT properties(${modelName}Node)) AS ALL_${modelName}${ progressiveWith.length > 0 ? (", " + progressiveWith.join(', ')) : '' }
    `);
    progressiveWith.push(`ALL_${modelName}`);
  });
  statements.push(`RETURN {
  ${returnStatements.join(',\n')}
}
  `);
  return statements.join('\n');
}
const logRequest = (request) => {
  console.log(`

--- Begin Request ---

Request:
  ${request.cypher}

Variables:
  ${JSON.stringify(request.variables, null, 2)}
`);
}
const logResponse = (data) => {
  console.log(`
    Response:
      ${JSON.stringify(data, null, 2)}
--- End Request---
`);
}
const buildUnwindStatements = ({
  rootModelType,
  rootFieldName,
  modelType,
  fieldPath
}) => {
  let elementName = "";
  let fieldName = "";
  let actionObj = {};
  let action = "";
  let parentElementName = undefined;
  const unwindStatements = [];
  let relatedModelType = "";
  fieldPath.forEach(field => {
    fieldName = Object.keys(field)[0];
    actionObj = field[fieldName];
    action = Object.keys(actionObj)[0];
    relatedModelType = actionObj[action];
    if(parentElementName === undefined) {
      elementName = `${rootModelType}${capitalizeName(fieldName)}${actionObj[action]}`;
      unwindStatements.push(`UNWIND {variables}.${fieldName}.${action} AS ${elementName}`);
    }
    else {
      elementName = `${parentElementName}${capitalizeName(fieldName)}${actionObj[action]}`;
      unwindStatements.push(`UNWIND ${parentElementName}.${fieldName}.${action} AS ${elementName}`);
    }
    parentElementName = elementName;
  });
  return unwindStatements.join('\n');
}
const buildRootMutationCall = ({
  mutationType,
  mutationName,
  modelType,
  indexConfig,
  mutationMap,
  modelMap,
  variables,
}) => {
  const mutation = mutationMap[mutationName];
  const rootModel = mutation.model;
  const cypher = mutation.cypher;
  const modelInfo = modelMap[rootModel];
  if(mutationType === "create") {
    variables = injectGeneratedID({
      indexConfig: indexConfig,
      variables: variables
    });
    return `CALL graphql.execute('${cypher}', { ${transformMutationVariables(variables, modelInfo)} }) YIELD result AS ${mutationName}Result WITH ${mutationName}Result AS ${mutationName}Result`;
  }
  if(mutationType === "add") {
    return `CALL graphql.execute('${cypher}', { ${transformVariables(variables)} }) YIELD result AS ${mutationName}Result`;
  }
  return "";
};
const processNestedMutationVariables = ({
  mutationType,
  mutationName,
  variables,
  nestedMutationVariables,
  modelMap,
  mutationMap,
  modelType,
  fieldName,
  mutationID,
  fieldPath,
  alreadyGenerated,
  rootModelType,
  rootFieldName,
  indexConfig,
  statements,
  uniqueVariableMap,
  depthAccumulator
}) => {
  const persistParents = [];
  const relatedModelType = getRelatedModelType({
    modelMap: modelMap,
    modelType: modelType,
    fieldName: fieldName
  });
  const parentMutationID = buildMutationID({
    modelType: modelType,
    fieldName: fieldName,
    mutationID: mutationID,
    relatedModelType: relatedModelType
  });
  // Add path to commulative path info map used to generate UNWIND sequences
  const fullPathArr = fieldPath.concat([{
    [fieldName]: {
      [mutationType]: relatedModelType
    }
  }]);
  // Cypher Generation
  if(!isAlreadyGenerated(alreadyGenerated, fieldName, mutationType)) {
    statements.push(buildNestedMutation({
      mutationType: mutationType,
      mutationName: mutationName,
      relatedModelType: relatedModelType,
      nestedMutation: nestedMutationVariables,
      modelType: modelType,
      rootModelType: rootModelType,
      rootFieldName: rootFieldName,
      fieldName: fieldName,
      mutationMap: mutationMap,
      modelMap: modelMap,
      variables: variables,
      parentElementName: mutationID,
      alreadyGenerated: alreadyGenerated,
      fieldPath: fullPathArr
    }));
  }
  // Recursion
  if(isArrayArgument(nestedMutationVariables)) {
    nestedMutationVariables.forEach(relatedModelVariables => {
      if(mutationType === "create") {
        relatedModelVariables = injectGeneratedID({
          indexConfig: indexConfig,
          variables: relatedModelVariables
        });
      }
      statements.push(buildNestedMutationRequest({
        mutationName: mutationName,
        mutationType: mutationType,
        variables: relatedModelVariables,
        statements: statements,
        uniqueVariableMap: uniqueVariableMap,
        modelMap: modelMap,
        mutationMap: mutationMap,
        indexConfig: indexConfig,
        modelType: relatedModelType,
        rootModelType: rootModelType,
        rootFieldName: rootFieldName,
        mutationID: parentMutationID,
        alreadyGenerated: alreadyGenerated[fieldName][mutationType],
        fieldPath: fullPathArr,
        depthAccumulator: depthAccumulator + 1
      }));
    });
  }
  else if(isObjectArgument(nestedMutationVariables)) {
    if(mutationType === "create") {
      nestedMutationVariables = injectGeneratedID({
        indexConfig: indexConfig,
        variables: nestedMutationVariables
      });
    }
    statements.push(buildNestedMutationRequest({
      mutationName: mutationName,
      mutationType: mutationType,
      variables: nestedMutationVariables,
      statements: statements,
      uniqueVariableMap: uniqueVariableMap,
      modelMap: modelMap,
      mutationMap: mutationMap,
      indexConfig: indexConfig,
      modelType: relatedModelType,
      rootModelType: rootModelType,
      rootFieldName: rootFieldName,
      mutationID: parentMutationID,
      alreadyGenerated: alreadyGenerated[fieldName][mutationType],
      fieldPath: fullPathArr,
      depthAccumulator: depthAccumulator + 1
    }));
  }
}
const buildNestedMutationRequest = ({
  mutationName,
  mutationType,
  variables,
  uniqueVariableMap,
  statements,
  modelMap,
  mutationMap,
  indexConfig,
  modelType,
  rootModelType,
  mutationID,
  alreadyGenerated,
  fieldPath,
  depthAccumulator
}) => {
  if(depthAccumulator > 5) throw Error("Nested mutations are limited to a depth of 5.");
  // This is needed for building the data model used in the MATCH statements used
  // for data retrieval after mutations process
  let field = {};
  mapUniqueVariableToModelType(uniqueVariableMap, modelType, modelMap, variables, mutationType);
  Object.keys(variables).forEach(fieldName => {
    field = variables[fieldName];
    let nestedCreate = field.create;
    let nestedConnect = field.connect;
    // Only a to-many relation should allow both create and connect nested mutations
    validateNestedMutationsForRelationArity(fieldName, modelType, modelMap, nestedCreate, nestedConnect);
    // always process a nested create before a connect, and only the first of either
    if(nestedCreate) {
      processNestedMutationVariables({
        mutationType: "create",
        nestedMutationVariables: nestedCreate,
        variables: variables,
        mutationName: mutationName,
        mutationMap: mutationMap,
        mutationID: mutationID,
        rootModelType: rootModelType,
        rootFieldName: fieldName,
        modelMap: modelMap,
        modelType: modelType,
        fieldName: fieldName,
        fieldPath: fieldPath,
        indexConfig: indexConfig,
        alreadyGenerated: alreadyGenerated,
        uniqueVariableMap: uniqueVariableMap,
        depthAccumulator: depthAccumulator,
        statements: statements
      });
    }
    if(nestedConnect) {
      processNestedMutationVariables({
        mutationType: "connect",
        nestedMutationVariables: nestedConnect,
        variables: variables,
        mutationName: mutationName,
        mutationMap: mutationMap,
        mutationID: mutationID,
        rootModelType: rootModelType,
        rootFieldName: fieldName,
        modelMap: modelMap,
        modelType: modelType,
        fieldName: fieldName,
        fieldPath: fieldPath,
        indexConfig: indexConfig,
        alreadyGenerated: alreadyGenerated,
        uniqueVariableMap: uniqueVariableMap,
        depthAccumulator: depthAccumulator,
        statements: statements
      });
    }
  });
  return statements;
}
const buildNestedMutation = ({
  mutationType,
  mutationName,
  nestedMutation,
  modelType,
  relatedModelType,
  fieldName,
  mutationMap,
  modelMap,
  rootModelType,
  rootFieldName,
  variables,
  parentElementName,
  alreadyGenerated,
  fieldPath
}) => {
  let statements = [];
  if(mutationType === "create" || mutationType === "connect") {
    // Get the name of the related model
    const relatedModelType = getRelatedModelType({
      modelMap: modelMap,
      modelType: modelType,
      fieldName: fieldName
    });
    // Get the pre-built mutation
    const relatedMutation = getMutationCypher({
      mutationMap: mutationMap,
      mutationType: mutationType,
      modelName: relatedModelType
    });
    // Compute a unique reference for the mutation
    const mutationID = buildMutationID({
      modelType: modelType,
      fieldName: fieldName,
      relatedModelType: relatedModelType,
      parentElementName: parentElementName
    });
    // Build the UNWIND statement for the mutation
    // UNWIND works for both array and object arguments :)
    if(mutationType === "create") {
      statements.push(buildNestedMutationCall({
        mutation: relatedMutation,
        mutationType: mutationType,
        modelType: modelType,
        rootModelType: rootModelType,
        rootFieldName: rootFieldName,
        fieldName: fieldName,
        relatedModelType: relatedModelType,
        mutationID: mutationID,
        mutationName: mutationName,
        parentElementName: parentElementName,
        alreadyGenerated: alreadyGenerated,
        fieldPath: fieldPath
      }));
    }
    // Build the corresponding relation mutation
    statements.push(buildRelationMutationCall({
      mutationType: mutationType,
      relationMutationType: 'add',
      mutationID: mutationID,
      variables: variables,
      modelType: modelType,
      rootModelType: rootModelType,
      rootFieldName: rootFieldName,
      modelMap: modelMap,
      mutationMap: mutationMap,
      fieldName: fieldName,
      parentElementName: parentElementName,
      alreadyGenerated: alreadyGenerated,
      fieldPath: fieldPath
    }));
    statements = statements.join("\n");
  }
  return statements;
}
const injectGeneratedID = ({
  indexConfig,
  variables
}) => {
  if(indexConfig === false) return variables;
  if(indexConfig !== undefined && indexConfig.use === "cuid") {
    if(variables.id === undefined) {
      variables.id = cuid();
    }
  }
  return variables;
}
const buildMutationID = ({
  modelType,
  fieldName,
  mutationID,
  relatedModelType,
  parentElementName
}) => {
  if(parentElementName) modelType = parentElementName;
  const suffix = capitalizeName(fieldName) + relatedModelType;
  return mutationID ? mutationID + suffix : modelType + suffix;
}
const getRelatedModelType = ({
  modelMap,
  modelType,
  fieldName
}) => {
  return modelMap[modelType].relations[fieldName];
}
const getMutationCypher = ({
  mutationMap,
  mutationType,
  modelName
}) => {
  switch(mutationType) {
    case "create": { return mutationMap[`${mutationType}${modelName}`].cypher; }
    default: { break; }
  }
  return "";
}
const buildMutationRequest = ({
  mutationName,
  operation,
  indexConfig,
  variables,
  generatedMutations,
  operationQuery,
  mutationMap,
  modelMap
}) => {
  const mutation = generatedMutations[mutationName];
  if(mutation) {
    let statements = [];
    const rootMutationInfo = mutationMap[mutationName];
    const rootModelType = rootMutationInfo.model;
    const model = modelMap[rootModelType];
    const mutationType = rootMutationInfo.action;
    const alreadyGenerated = {};
    variables = prepareVariables(mutationType, variables);
    statements.push(buildRootMutationCall({
      mutationType: mutationType,
      modelType: rootModelType,
      mutationName: mutationName,
      variables: variables,
      indexConfig: indexConfig,
      mutationMap: mutationMap,
      modelMap: modelMap
    }));
    const uniqueVariableMap = {};
    statements = buildNestedMutationRequest({
      mutationType: mutationType,
      mutationName: mutationName,
      variables: variables,
      uniqueVariableMap: uniqueVariableMap,
      statements: statements,
      modelMap: modelMap,
      mutationMap: mutationMap,
      indexConfig: indexConfig,
      modelType: rootModelType,
      rootModelType: rootModelType,
      alreadyGenerated: alreadyGenerated,
      fieldPath: [],
      depthAccumulator: 0
    });
    statements = statements.join("\n");
    const mergedVariables = Object.assign({ variables: variables }, uniqueVariableMap);
    const returnStatement = buildReturnQueryStatements(uniqueVariableMap, modelMap);
    statements += returnStatement;
    return {
      cypher: statements,
      variables: mergedVariables,
      rootModelType: rootModelType,
      mutationType: mutationType,
      uniqueVariableMap: uniqueVariableMap
    };
  }
  else {
    // Non-generated mutation taken from post-binding operation is passed straight to neo4j
    return {
      cypher: `CALL graphql.execute('${operationQuery}', {${transformVariables(variables)}})`,
      variables: variables
    }
  }
};
const transformMutationVariables = (variables, modelInfo) => {
  let transformed = [];
  const properties = modelInfo.properties;
  const variableKeys = Object.keys(variables);
  Object.keys(properties).forEach(fieldName => {
    if(fieldName !== "_id") {
      if(variableKeys.includes(fieldName)) {
        transformed.push(`${fieldName}: {variables}.${fieldName}`);
      }
      else {
        transformed.push(`${fieldName}: NULL`);
      }
    }
  })
  return transformed.join(', ');
};
const transformVariables = (params) => {
  let transformed = [];
  let transformedParam = "";
  let param = '';
  let p = 0;
  const keys = Object.keys(params);
  const len = keys.length;
  let fieldValue = params[param];
  for(; p < len; ++p) {
    param = keys[p];
    transformed.push(`${param}: {${param}}`);
  }
  return transformed.join(', ');
};
const transformVariableList = (variables, fields, parentID) => {
  let transformed = [];
  const variableKeys = Object.keys(variables);
  fields.forEach(fieldName => {
    if(parentID) {
      transformed.push(`${fieldName}: ${parentID}.${fieldName}`);
    }
    else {
      // If no parent variable is being used, then we are on the root level, accessing parameters
      // e.g., {where}, etc., so we must add NULL values for fields that are not provided in the
      // req variables to prevent errors about expected, unprovided parameters
      if(variableKeys.includes(fieldName)) {
        transformed.push(`${fieldName}: {variables}.${fieldName}`);
      }
      else {
        transformed.push(`${fieldName}: NULL`);
      }
    }
  });
  return transformed.join(', ');
}
const getModelUniqueProperties = ({ modelType, modelMap }) => {
  return modelMap[modelType].uniqueProperties;
}
const buildRelationMutationName = (mutationType, modelType, fieldName) => {
  return `${mutationType}${modelType}${capitalizeName(fieldName)}`;
}
const isAlreadyGenerated = (alreadyGenerated, fieldName, mutationType) => {
  if(!alreadyGenerated[fieldName]) alreadyGenerated[fieldName] = {}
  const wasGenerated = alreadyGenerated[fieldName][mutationType];
  if(!wasGenerated) alreadyGenerated[fieldName][mutationType] = {};
  return wasGenerated;
}
const isArrayArgument = (data) => {
  return Array.isArray(data);
}
const isObjectArgument = (data) => {
  return typeof data === "object";
}
const mapUniqueVariableToModelType = (uniqueVariableMap, modelType, modelMap, variables, mutationType) => {
  // initialize
  const modelInfo = modelMap[modelType];
  const uniqueProperties = modelInfo.uniqueProperties;
  if(!uniqueVariableMap[modelType]) uniqueVariableMap[modelType] = [];
  switch(mutationType) {
    case "create": {
      // create mutations will only ever need to use the auto-generated id field for lookup
      let fieldMap = {};
      uniqueProperties.forEach(fieldName => {
        fieldMap[fieldName] = variables[fieldName]
      });
      uniqueVariableMap[modelType].push(fieldMap);
      break;
    }
    case "connect": {
      // connect mutations will only ever need to use the auto-generated id field for lookup
      let fieldMap = {};
      uniqueProperties.forEach(fieldName => {
        fieldMap[fieldName] = variables[fieldName]
      });
      uniqueVariableMap[modelType].push(fieldMap);
      break;
    }
    default: {
      break;
    }
  }
}
const validateNestedMutationsForRelationArity = (fieldName, modelType, modelMap, nestedCreate, nestedConnect) => {
  if(nestedCreate && nestedConnect) {
    const model = modelMap[modelType];
    const listMap = model.listMap;
    if(!listMap[fieldName]) {
      throw Error(`Field ${fieldName} on model type ${modelType} is not a to-many relation, so you cannot use both create and connect at the same time.`);
    }
  }
}
const uniqueFieldComparisonDisjunction = (modelName, uniqueFields) => {
  const statements = [];
  uniqueFields.forEach(fieldName => {
    // Default to true, so that we continue along the rest of the disjuncts, knowing that there will always
    // be at least 1 match for the first provided unique field value for whatever unique fields are provided
    // for node selection - allowing which unique fields are provided, to vary from object to object in
    // a single mutation
    // https://neo4j.com/docs/developer-manual/current/cypher/clauses/where/#default-to-true-missing-property
    statements.push(`(${modelName}Node.${fieldName} = _${modelName}.${fieldName} OR _${modelName}.${fieldName} IS NULL)`);
  });
  return statements.join(` OR `);
}
const getGeneratedMutations = (parsed) => {
  const operationMap = buildOperationMap(parsed);
  const mutations = operationMap.mutations;
  const mutationMap = mutations ? mutations.fieldMap : {};
  const generated = {};
  let mutation = {};
  Object.keys(mutationMap).forEach(mutationName => {
    mutation = mutationMap[mutationName];
    if(isGeneratedMutation(mutation)) {
      generated[mutationName] = mutation;
    }
  });
  return generated;
}
const capitalizeName = (name) => {
  return name.charAt(0).toUpperCase() + name.substr(1);
}
const buildCurrentPath = (rootModelType, fullPathArr) => {
  let fullPath = rootModelType;
  fullPathArr.forEach(fieldInfo => {
    let fieldName = Object.keys(fieldInfo)[0];
    let relatedModel = fieldInfo[fieldName];
    fullPath += capitalizeName(fieldName) + relatedModel;
  });
  return fullPath;
}
const isGeneratedMutation = (ast) => {
  const directives = ast.directives;
  let isGenerated = false;
  if(directives) {
    directives.forEach(directive => {
      if(directive.name.value === "Neo4jGraphQLBinding") {
        isGenerated = true;
      }
    });
  }
  return isGenerated;
};
const buildMutationArguments = (model) => {
  const fields = model.fields;
  const arr = [];
  let isRequired = false;
  fields.forEach(field => {
    let name = field.name.value;
    if(!isRelation(field) && !hasDirective(field, "cypher") && name !== "_id") {
      arr.push(`${name}: $${name}`);
    }
  });
  return arr.join(", ");
};
const buildMutationVariables = (model) => {
  const fields = model.fields;
  const arr = [];
  fields.forEach(field => {
    let name = field.name.value;
    if(!isRelation(field) && !hasDirective(field, "cypher") && name !== "_id") {
      arr.push(`$${name}: ${print(field.type)}`);
    }
  });
  return arr.join(", ");
};
const buildMutationSelections = (model) => {
  const fields = model.fields;
  const arr = [];
  fields.forEach(field => {
    let name = field.name.value;
    if(!isRelation(field) && name !== "_id") {
      arr.push(name);
    }
  });
  return arr.join(" ");
};
const getModelIdFieldAST = (fields) => {
  // Is the first ID type field or undefined
  const idField = fields.find(field => {
    return getFieldType(field) === "ID";
  });
  // Is the first NonNullType scalar field
  const firstRequiredScalar = fields.find(field => {
    return getFieldType(field) === "String" && field.type.kind === "NonNullType";
  });
  // Prefer the ID field, then the NonNullType scalar, else undefined
  return idField ? idField : (firstRequiredScalar ? firstRequiredScalar : undefined);
};
const buildMutationMap = (parsed, modelMap, generatedMutations) => {
  const typeMaps = buildTypeMaps(parsed);
  const models = typeMaps.models;
  const mutationMap = {};
  let modelInfo = {};
  let fields = [];
  let model = {};
  Object.keys(models).forEach(modelName => {
    model = models[modelName].def;
    let createType = `create${modelName}`;
    if(generatedMutations[createType]) {
      mutationMap[createType] = {
        action: "create",
        model: modelName,
        cypher: `mutation create${modelName}(${buildMutationVariables(model)}) { create${modelName}(${buildMutationArguments(model)})}`
      }
    }
    fields = model.fields;
    let fieldName = "";
    let fieldType = undefined;
    fields.forEach(field => {
      if(isRelation(field)) {
        fieldName = field.name.value;
        fieldType = getFieldType(field);
        if(fieldName !== undefined && fieldType !== undefined) {
          const addRelationType = `add${modelName}${capitalizeName(fieldName)}`;
          mutationMap[addRelationType] = {
            action: "add",
            model: modelName,
            cypher: `mutation ${addRelationType}($where: ${modelName}WhereUniqueInput!, $${fieldName}: [${fieldType}WhereUniqueInput!]!) { ${addRelationType}(where: $where, ${fieldName}: $${fieldName}) }`
          }
        }
      }
    });
  });
  return mutationMap;
};
const isListType = (field) => {
  let type = field.type;
  let isListType = false;
  while(type.kind !== "NamedType") {
     if(type.kind === "ListType") {
       isListType = true;
     }
     type = type.type;
  }
  return isListType;
}
const buildModelMap = (parsed) => {
  const typeMaps = buildTypeMaps(parsed);
  const models = typeMaps.models;
  const modelMap = {};
  let fields = [];
  let model = {};
  let idFieldAST = undefined;
  let relationMap = undefined;
  let propertyMap = undefined;
  let listMap = undefined;
  let uniqueProperties = undefined;
  let modelFieldMaps = {};
  Object.keys(models).forEach(modelName => {
    model = models[modelName].def;
    if(!modelMap[modelName]) {
      fields = model.fields;
      idFieldAST = getModelIdFieldAST(fields);
      modelFieldMaps = getModelFieldMaps(fields);
      relationMap = modelFieldMaps.relationMap;
      propertyMap = modelFieldMaps.propertyMap;
      listMap = modelFieldMaps.listMap;
      uniqueProperties = modelFieldMaps.uniqueProperties;
      if(!modelMap[modelName] && (idFieldAST || relationMap)) modelMap[modelName] = {};
      if(relationMap) modelMap[modelName].relations = relationMap;
      if(propertyMap) modelMap[modelName].properties = propertyMap;
      if(listMap) modelMap[modelName].listMap = listMap;
      if(uniqueProperties) modelMap[modelName].uniqueProperties = uniqueProperties;
    }
  });
  return modelMap;
};
const isRelation = (field) => {
  const directives = field.directives;
  let isRelation = false;
  directives.forEach(directive => {
    if(directive.name.value === "relation") {
      isRelation = true;
    }
  });
  return isRelation;
};
const hasDirective = (field, match) => {
  const directives = field.directives;
  let has = false;
  directives.forEach(directive => {
    if(directive.name.value === match) {
      has = true;
    }
  });
  return has;
};
const removeVariableCounterPrefix = (variableName) => {
  const firstUnderscoreSkipped = variableName ? variableName.substr(1) : false;
  const secondUnderscoreIndex = firstUnderscoreSkipped ? firstUnderscoreSkipped.indexOf('_') : -1;
  return secondUnderscoreIndex !== -1 ? variableName.substr(secondUnderscoreIndex+2) : variableName;
}
const prepareVariables = (action, variables) => {
  let prepared = {};
  switch(action) {
    case "create": {
      Object.keys(variables).forEach(variableName => {
        prepared[removeVariableCounterPrefix(variableName)] = variables[variableName];
      });
      return prepared.data;
    }
    case "add": {
      Object.keys(variables).forEach(variableName => {
        prepared[removeVariableCounterPrefix(variableName)] = variables[variableName];
      });
      return prepared;
      break;
    }
    default: {
      break;
    }
  }
}
const getMutationNameFromOperation = (operation) => {
  return operation.query.definitions[0].selectionSet.selections[0].name.value;
}
const buildResultMap = (models, modelMap) => {
  const resultMap = {};
  let uniqueFieldsOfModel = [];
  Object.keys(models).forEach(name => {
    uniqueFieldsOfModel = modelMap[name].uniqueProperties;
    if(!resultMap[name]) resultMap[name] = {};
    uniqueFieldsOfModel.forEach(fieldName => {
      resultMap[name][fieldName] = arrayToObject(models[name], fieldName);
    });
  });
  return resultMap;
}
// From: https://medium.com/dailyjs/rewriting-javascript-converting-an-array-of-objects-to-an-object-ec579cafbfc7
const arrayToObject = (arr, keyField) => Object.assign({}, ...arr.map(item => ({[item[keyField]]: item})));
const mergeResultWithVariables = (variables, modelType, modelMap, uniqueModelFieldMap, mutationType) => {
  // Injection
  switch(mutationType) {
    case "create": {
      variables = Object.assign(variables, uniqueModelFieldMap[modelType]["id"][variables.id]);
      break;
    }
    case "connect": {
      const uniqueProperties = modelMap[modelType].uniqueProperties[0];
      const firstVariableKey = Object.keys(variables)[0];
      const dataMap = uniqueModelFieldMap[modelType][firstVariableKey];
      const uniqueFieldValue = variables[firstVariableKey];
      variables = Object.assign(variables, dataMap[uniqueFieldValue]);
      break;
    }
    default: {
      break;
    }
  }
  // Recursion
  Object.keys(variables).forEach(fieldName => {
    let nestedCreate = variables[fieldName].create;
    let nestedConnect = variables[fieldName].connect;
    if(nestedCreate) {
      variables[fieldName] = variables[fieldName].create;
      const relatedModelType = getRelatedModelType({ modelMap, modelType, fieldName });
      if(isArrayArgument(nestedCreate)) {
        nestedCreate.forEach(relatedModelVariables => {
          mergeResultWithVariables(relatedModelVariables, relatedModelType, modelMap, uniqueModelFieldMap, "create");
        });
      }
      else if(isObjectArgument(nestedCreate)) {
        mergeResultWithVariables(nestedCreate, relatedModelType, modelMap, uniqueModelFieldMap, "create");
      }
    }
    if(nestedConnect) {
      const relatedModelType = getRelatedModelType({ modelMap, modelType, fieldName });
      if(isArrayArgument(nestedConnect)) {
        if(nestedCreate) {
          variables[fieldName] = variables[fieldName].concat(nestedConnect);
        }
        else {
          variables[fieldName] = variables[fieldName].connect;
        }
        nestedConnect.forEach(relatedModelVariables => {
          mergeResultWithVariables(relatedModelVariables, relatedModelType, modelMap, uniqueModelFieldMap, "connect");
        });
      }
      else if(isObjectArgument(nestedConnect)) {
        if(nestedCreate) {
          variables[fieldName] = Object.assign(variables[fieldName], nestedConnect);
        }
        else {
          variables[fieldName] = variables[fieldName].connect;
        }
        mergeResultWithVariables(nestedConnect, relatedModelType, modelMap, uniqueModelFieldMap, "connect");
      }
    }
  });
}
const formatResult = ({
  variables,
  mutationType,
  modelMap,
  modelType,
  mutationName,
  generatedMutations,
  result,
  logRequests
}) => {
  const data = { data: {} };
  switch(mutationType) {
    case "create": {
      if(generatedMutations[mutationName]) {
        if(result && result.records && result.records[0] && result.records[0]._fields) {
          const uniqueModels = result.records[0]._fields[0];
          const uniqueModelFieldMap = buildResultMap(uniqueModels, modelMap);
          mergeResultWithVariables(variables, modelType, modelMap, uniqueModelFieldMap, "create");
          data.data[mutationName] = variables;
          if(logRequests) logResponse(data);
        }
      }
      break;
    }
    default: {
      data.data[mutationName] = result.records[0]._fields[0][mutationName];
      if(logRequests) logResponse(data);
      break;
    }
  }
  return data;
}
