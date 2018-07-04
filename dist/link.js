'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getModelFieldMaps = exports.neo4jGraphQLLink = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _apolloLink = require('apollo-link');

var _graphql = require('graphql');

var _typedefs = require('./typedefs.js');

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var cuid = require('cuid');

var neo4jGraphQLLink = exports.neo4jGraphQLLink = function neo4jGraphQLLink(_ref) {
  var typeDefs = _ref.typeDefs,
      driver = _ref.driver,
      _ref$log = _ref.log,
      log = _ref$log === undefined ? false : _ref$log,
      indexConfig = _ref.indexConfig;

  var parsed = (0, _graphql.parse)(typeDefs);
  var generatedMutations = getGeneratedMutations(parsed);
  var modelMap = buildModelMap(parsed);
  var mutationMap = buildMutationMap(parsed, modelMap, generatedMutations);
  return new _apolloLink.ApolloLink(function (operation, forward) {
    var type = getOperationType(operation);
    return new _apolloLink.Observable(function (observer) {
      switch (type) {
        case 'query':
          {
            return neo4jGraphqlQuery(type, driver, observer, operation, log);
          }
        case 'mutation':
          {
            return neo4jGraphqlExecute(type, driver, observer, operation, log, indexConfig, generatedMutations, mutationMap, modelMap);
          }
        default:
          {
            throw Error("neo4jGraphqlLink Error: Request type " + type + " is not supported.");
          }
      }
    });
  });
};
var getModelFieldMaps = exports.getModelFieldMaps = function getModelFieldMaps(fields) {
  var relationMap = {};
  var propertyMap = {};
  var listMap = {};
  var uniqueProperties = [];
  var fieldType = undefined;
  var fieldName = "";
  fields.forEach(function (field) {
    fieldName = field.name.value;
    fieldType = (0, _typedefs.getFieldType)(field);
    if (fieldName !== undefined && fieldType !== undefined) {
      if (isRelation(field)) {
        if (fieldType) relationMap[fieldName] = fieldType;
        if (isListType(field)) listMap[fieldName] = true;
      } else {
        if (!hasDirective(field, "cypher")) {
          if (fieldType) propertyMap[fieldName] = fieldType;
          if (hasDirective(field, "unique") || hasDirective(field, "isUnique") || fieldName === "id") uniqueProperties.push(fieldName);
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
};

var getOperationType = function getOperationType(operation) {
  // After the binding delegates, the operation definition
  // is reduced to be only that of the delegated operation,
  // so we can trust that there is only one and access it
  // at .definitions[0]
  return operation.query.definitions[0].operation;
};

var neo4jGraphqlQuery = function neo4jGraphqlQuery(operationType, driver, observer, operation, logRequests) {
  var session = driver.session();
  var queryAST = operation.query;
  var request = (0, _graphql.print)(queryAST);
  var variables = operation.variables;
  if (logRequests) {
    logRequest({
      cypher: request,
      variables: variables
    });
  }
  session.run('CALL graphql.query(\'' + request + '\', {' + transformVariables(variables) + '})', variables).then(function (result) {
    session.close();
    var data = result.records[0]._fields[0];
    if (logRequests) logResponse(data);
    observer.next({ data: data });
    observer.complete();
  }).catch(function (error) {
    observer.error(error);
  });
};
var neo4jGraphqlExecute = function neo4jGraphqlExecute(operationType, driver, observer, operation, logRequests, indexConfig, generatedMutations, mutationMap, modelMap) {
  var session = driver.session();
  var mutationName = getMutationNameFromOperation(operation);
  var variables = operation.variables;
  var operationQueryAST = operation.query;
  var operationQuery = (0, _graphql.print)(operationQueryAST);
  var request = buildMutationRequest({
    mutationName: mutationName,
    operation: operation,
    indexConfig: indexConfig,
    variables: variables,
    generatedMutations: generatedMutations,
    mutationMap: mutationMap,
    modelMap: modelMap,
    operationQuery: operationQuery
  });
  if (logRequests) logRequest(request);
  session.run(request.cypher, request.variables).then(function (result) {
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
  }).catch(function (error) {
    observer.error(error);
  });
};
var buildNestedMutationCall = function buildNestedMutationCall(_ref2) {
  var rootModelType = _ref2.rootModelType,
      rootFieldName = _ref2.rootFieldName,
      mutation = _ref2.mutation,
      fieldPath = _ref2.fieldPath,
      modelType = _ref2.modelType,
      relatedModelType = _ref2.relatedModelType,
      mutationType = _ref2.mutationType,
      parentElementName = _ref2.parentElementName,
      mutationName = _ref2.mutationName,
      mutationID = _ref2.mutationID,
      fieldName = _ref2.fieldName,
      alreadyGenerated = _ref2.alreadyGenerated,
      batch = _ref2.batch;

  switch (mutationType) {
    case "create":
      {
        return '\nWITH COUNT(*) AS SCOPE\n' + buildUnwindStatements({
          rootModelType: rootModelType,
          rootFieldName: rootFieldName,
          modelType: modelType,
          fieldPath: fieldPath
        }) + '\nCALL graphql.execute(\'' + mutation + '\', ' + mutationID + ') YIELD result AS ' + mutationType + mutationID + 'Result\n      ';
      }
  }
};
var buildRelationMutationCall = function buildRelationMutationCall(_ref3) {
  var fieldName = _ref3.fieldName,
      mutationID = _ref3.mutationID,
      variables = _ref3.variables,
      modelType = _ref3.modelType,
      modelMap = _ref3.modelMap,
      relationMutationType = _ref3.relationMutationType,
      mutationType = _ref3.mutationType,
      parentElementName = _ref3.parentElementName,
      mutationMap = _ref3.mutationMap,
      alreadyGenerated = _ref3.alreadyGenerated,
      fieldPath = _ref3.fieldPath,
      rootModelType = _ref3.rootModelType,
      rootFieldName = _ref3.rootFieldName;

  var mutationName = '' + relationMutationType + modelType + capitalizeName(fieldName);
  var relationMutationInfo = mutationMap[mutationName];
  var relationMutation = relationMutationInfo.cypher;
  var relationModelType = getRelatedModelType({
    modelMap: modelMap,
    modelType: modelType,
    fieldName: fieldName
  });
  var uniqueFields = getModelUniqueProperties({
    modelType: modelType,
    modelMap: modelMap
  });
  var uniqueRelationFields = getModelUniqueProperties({
    modelType: relationModelType,
    modelMap: modelMap
  });
  switch (mutationType) {
    case "create":
      {
        switch (relationMutationType) {
          case "add":
            {
              if (parentElementName === undefined) {
                return 'CALL graphql.execute(\'' + relationMutation + '\', { where: { ' + transformVariableList(variables, uniqueFields) + ' }, ' + fieldName + ': [{' + transformVariableList(variables, uniqueRelationFields, mutationID) + '}] }) YIELD result AS ' + mutationName + mutationID + 'Result';
              }
              return 'CALL graphql.execute(\'' + relationMutation + '\', { where: { ' + transformVariableList(variables, uniqueFields, parentElementName) + ' }, ' + fieldName + ': [{' + transformVariableList(variables, uniqueRelationFields, mutationID) + '}] }) YIELD result AS ' + mutationName + mutationID + 'Result';
            }
          default:
            {
              break;
            }
        }
        break;
      }
    case "connect":
      {
        switch (relationMutationType) {
          case "add":
            {
              if (parentElementName === undefined) {
                return '\nWITH COUNT(*) AS SCOPE\n' + buildUnwindStatements({
                  rootModelType: rootModelType,
                  rootFieldName: rootFieldName,
                  modelType: modelType,
                  fieldPath: fieldPath
                }) + '\nCALL graphql.execute(\'' + relationMutation + '\', { where: { ' + transformVariableList(variables, uniqueFields) + ' }, ' + fieldName + ': [{' + transformVariableList(variables, uniqueRelationFields, mutationID) + '}] }) YIELD result AS ' + mutationName + mutationID + 'Result';
              }
              return '\nWITH COUNT(*) AS SCOPE\n' + buildUnwindStatements({
                rootModelType: rootModelType,
                rootFieldName: rootFieldName,
                modelType: modelType,
                fieldPath: fieldPath
              }) + '\nCALL graphql.execute(\'' + relationMutation + '\', { where: { ' + transformVariableList(variables, uniqueFields, parentElementName) + ' }, ' + fieldName + ': [{' + transformVariableList(variables, uniqueRelationFields, mutationID) + '}] }) YIELD result AS ' + mutationName + mutationID + 'Result';
            }
          default:
            {
              break;
            }
        }
        break;
      }
    default:
      {
        break;
      }
  }
};
var buildReturnQueryStatements = function buildReturnQueryStatements(uniqueVariableMap, modelMap) {
  var statements = [];
  var returnStatements = [];
  var uniqueFields = [];
  var progressiveWith = [];
  Object.keys(uniqueVariableMap).forEach(function (modelName) {
    // There will be at least the id field for every model
    uniqueFields = modelMap[modelName].uniqueProperties;
    returnStatements.push(modelName + ': ALL_' + modelName);
    statements.push('\nUNWIND {' + modelName + '} AS _' + modelName + '\nMATCH (' + modelName + 'Node: ' + modelName + ') WHERE ' + uniqueFieldComparisonDisjunction(modelName, uniqueFields) + '\nWITH COLLECT(DISTINCT properties(' + modelName + 'Node)) AS ALL_' + modelName + (progressiveWith.length > 0 ? ", " + progressiveWith.join(', ') : '') + '\n    ');
    progressiveWith.push('ALL_' + modelName);
  });
  statements.push('RETURN {\n  ' + returnStatements.join(',\n') + '\n}\n  ');
  return statements.join('\n');
};
var logRequest = function logRequest(request) {
  console.log('\n\n--- Begin Request ---\n\nRequest:\n  ' + request.cypher + '\n\nVariables:\n  ' + JSON.stringify(request.variables, null, 2) + '\n');
};
var logResponse = function logResponse(data) {
  console.log('\n    Response:\n      ' + JSON.stringify(data, null, 2) + '\n--- End Request---\n');
};
var buildUnwindStatements = function buildUnwindStatements(_ref4) {
  var rootModelType = _ref4.rootModelType,
      rootFieldName = _ref4.rootFieldName,
      modelType = _ref4.modelType,
      fieldPath = _ref4.fieldPath;

  var elementName = "";
  var fieldName = "";
  var actionObj = {};
  var action = "";
  var parentElementName = undefined;
  var unwindStatements = [];
  var relatedModelType = "";
  fieldPath.forEach(function (field) {
    fieldName = Object.keys(field)[0];
    actionObj = field[fieldName];
    action = Object.keys(actionObj)[0];
    relatedModelType = actionObj[action];
    if (parentElementName === undefined) {
      elementName = '' + rootModelType + capitalizeName(fieldName) + actionObj[action];
      unwindStatements.push('UNWIND {variables}.' + fieldName + '.' + action + ' AS ' + elementName);
    } else {
      elementName = '' + parentElementName + capitalizeName(fieldName) + actionObj[action];
      unwindStatements.push('UNWIND ' + parentElementName + '.' + fieldName + '.' + action + ' AS ' + elementName);
    }
    parentElementName = elementName;
  });
  return unwindStatements.join('\n');
};
var buildRootMutationCall = function buildRootMutationCall(_ref5) {
  var mutationType = _ref5.mutationType,
      mutationName = _ref5.mutationName,
      modelType = _ref5.modelType,
      indexConfig = _ref5.indexConfig,
      mutationMap = _ref5.mutationMap,
      modelMap = _ref5.modelMap,
      variables = _ref5.variables;

  var mutation = mutationMap[mutationName];
  var rootModel = mutation.model;
  var cypher = mutation.cypher;
  var modelInfo = modelMap[rootModel];
  if (mutationType === "create") {
    variables = injectGeneratedID({
      indexConfig: indexConfig,
      variables: variables
    });
    return 'CALL graphql.execute(\'' + cypher + '\', { ' + transformMutationVariables(variables, modelInfo) + ' }) YIELD result AS ' + mutationName + 'Result WITH ' + mutationName + 'Result AS ' + mutationName + 'Result';
  }
  if (mutationType === "add") {
    return 'CALL graphql.execute(\'' + cypher + '\', { ' + transformVariables(variables) + ' }) YIELD result AS ' + mutationName + 'Result';
  }
  return "";
};
var processNestedMutationVariables = function processNestedMutationVariables(_ref6) {
  var mutationType = _ref6.mutationType,
      mutationName = _ref6.mutationName,
      variables = _ref6.variables,
      nestedMutationVariables = _ref6.nestedMutationVariables,
      modelMap = _ref6.modelMap,
      mutationMap = _ref6.mutationMap,
      modelType = _ref6.modelType,
      fieldName = _ref6.fieldName,
      mutationID = _ref6.mutationID,
      fieldPath = _ref6.fieldPath,
      alreadyGenerated = _ref6.alreadyGenerated,
      rootModelType = _ref6.rootModelType,
      rootFieldName = _ref6.rootFieldName,
      indexConfig = _ref6.indexConfig,
      statements = _ref6.statements,
      uniqueVariableMap = _ref6.uniqueVariableMap,
      depthAccumulator = _ref6.depthAccumulator;

  var persistParents = [];
  var relatedModelType = getRelatedModelType({
    modelMap: modelMap,
    modelType: modelType,
    fieldName: fieldName
  });
  var parentMutationID = buildMutationID({
    modelType: modelType,
    fieldName: fieldName,
    mutationID: mutationID,
    relatedModelType: relatedModelType
  });
  // Add path to commulative path info map used to generate UNWIND sequences
  var fullPathArr = fieldPath.concat([_defineProperty({}, fieldName, _defineProperty({}, mutationType, relatedModelType))]);
  // Cypher Generation
  if (!isAlreadyGenerated(alreadyGenerated, fieldName, mutationType)) {
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
  if (isArrayArgument(nestedMutationVariables)) {
    nestedMutationVariables.forEach(function (relatedModelVariables) {
      if (mutationType === "create") {
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
  } else if (isObjectArgument(nestedMutationVariables)) {
    if (mutationType === "create") {
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
};
var buildNestedMutationRequest = function buildNestedMutationRequest(_ref8) {
  var mutationName = _ref8.mutationName,
      mutationType = _ref8.mutationType,
      variables = _ref8.variables,
      uniqueVariableMap = _ref8.uniqueVariableMap,
      statements = _ref8.statements,
      modelMap = _ref8.modelMap,
      mutationMap = _ref8.mutationMap,
      indexConfig = _ref8.indexConfig,
      modelType = _ref8.modelType,
      rootModelType = _ref8.rootModelType,
      mutationID = _ref8.mutationID,
      alreadyGenerated = _ref8.alreadyGenerated,
      fieldPath = _ref8.fieldPath,
      depthAccumulator = _ref8.depthAccumulator;

  if (depthAccumulator > 5) throw Error("Nested mutations are limited to a depth of 5.");
  // This is needed for building the data model used in the MATCH statements used
  // for data retrieval after mutations process
  var field = {};
  mapUniqueVariableToModelType(uniqueVariableMap, modelType, modelMap, variables, mutationType);
  Object.keys(variables).forEach(function (fieldName) {
    field = variables[fieldName];
    var nestedCreate = field.create;
    var nestedConnect = field.connect;
    // Only a to-many relation should allow both create and connect nested mutations
    validateNestedMutationsForRelationArity(fieldName, modelType, modelMap, nestedCreate, nestedConnect);
    // always process a nested create before a connect, and only the first of either
    if (nestedCreate) {
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
    if (nestedConnect) {
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
};
var buildNestedMutation = function buildNestedMutation(_ref9) {
  var mutationType = _ref9.mutationType,
      mutationName = _ref9.mutationName,
      nestedMutation = _ref9.nestedMutation,
      modelType = _ref9.modelType,
      relatedModelType = _ref9.relatedModelType,
      fieldName = _ref9.fieldName,
      mutationMap = _ref9.mutationMap,
      modelMap = _ref9.modelMap,
      rootModelType = _ref9.rootModelType,
      rootFieldName = _ref9.rootFieldName,
      variables = _ref9.variables,
      parentElementName = _ref9.parentElementName,
      alreadyGenerated = _ref9.alreadyGenerated,
      fieldPath = _ref9.fieldPath;

  var statements = [];
  if (mutationType === "create" || mutationType === "connect") {
    // Get the name of the related model
    var _relatedModelType = getRelatedModelType({
      modelMap: modelMap,
      modelType: modelType,
      fieldName: fieldName
    });
    // Get the pre-built mutation
    var relatedMutation = getMutationCypher({
      mutationMap: mutationMap,
      mutationType: mutationType,
      modelName: _relatedModelType
    });
    // Compute a unique reference for the mutation
    var mutationID = buildMutationID({
      modelType: modelType,
      fieldName: fieldName,
      relatedModelType: _relatedModelType,
      parentElementName: parentElementName
    });
    // Build the UNWIND statement for the mutation
    // UNWIND works for both array and object arguments :)
    if (mutationType === "create") {
      statements.push(buildNestedMutationCall({
        mutation: relatedMutation,
        mutationType: mutationType,
        modelType: modelType,
        rootModelType: rootModelType,
        rootFieldName: rootFieldName,
        fieldName: fieldName,
        relatedModelType: _relatedModelType,
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
};
var injectGeneratedID = function injectGeneratedID(_ref10) {
  var indexConfig = _ref10.indexConfig,
      variables = _ref10.variables;

  if (indexConfig === false) return variables;
  if (indexConfig !== undefined && indexConfig.use === "cuid") {
    if (variables.id === undefined) {
      variables.id = cuid();
    }
  }
  return variables;
};
var buildMutationID = function buildMutationID(_ref11) {
  var modelType = _ref11.modelType,
      fieldName = _ref11.fieldName,
      mutationID = _ref11.mutationID,
      relatedModelType = _ref11.relatedModelType,
      parentElementName = _ref11.parentElementName;

  if (parentElementName) modelType = parentElementName;
  var suffix = capitalizeName(fieldName) + relatedModelType;
  return mutationID ? mutationID + suffix : modelType + suffix;
};
var getRelatedModelType = function getRelatedModelType(_ref12) {
  var modelMap = _ref12.modelMap,
      modelType = _ref12.modelType,
      fieldName = _ref12.fieldName;

  return modelMap[modelType].relations[fieldName];
};
var getMutationCypher = function getMutationCypher(_ref13) {
  var mutationMap = _ref13.mutationMap,
      mutationType = _ref13.mutationType,
      modelName = _ref13.modelName;

  switch (mutationType) {
    case "create":
      {
        return mutationMap['' + mutationType + modelName].cypher;
      }
    default:
      {
        break;
      }
  }
  return "";
};
var buildMutationRequest = function buildMutationRequest(_ref14) {
  var mutationName = _ref14.mutationName,
      operation = _ref14.operation,
      indexConfig = _ref14.indexConfig,
      variables = _ref14.variables,
      generatedMutations = _ref14.generatedMutations,
      operationQuery = _ref14.operationQuery,
      mutationMap = _ref14.mutationMap,
      modelMap = _ref14.modelMap;

  var mutation = generatedMutations[mutationName];
  if (mutation) {
    var statements = [];
    var rootMutationInfo = mutationMap[mutationName];
    var rootModelType = rootMutationInfo.model;
    var model = modelMap[rootModelType];
    var mutationType = rootMutationInfo.action;
    var alreadyGenerated = {};
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
    var uniqueVariableMap = {};
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
    var mergedVariables = Object.assign({ variables: variables }, uniqueVariableMap);
    var returnStatement = buildReturnQueryStatements(uniqueVariableMap, modelMap);
    statements += returnStatement;
    return {
      cypher: statements,
      variables: mergedVariables,
      rootModelType: rootModelType,
      mutationType: mutationType,
      uniqueVariableMap: uniqueVariableMap
    };
  } else {
    // Non-generated mutation taken from post-binding operation is passed straight to neo4j
    return {
      cypher: 'CALL graphql.execute(\'' + operationQuery + '\', {' + transformVariables(variables) + '})',
      variables: variables
    };
  }
};
var transformMutationVariables = function transformMutationVariables(variables, modelInfo) {
  var transformed = [];
  var properties = modelInfo.properties;
  var variableKeys = Object.keys(variables);
  Object.keys(properties).forEach(function (fieldName) {
    if (fieldName !== "_id") {
      if (variableKeys.includes(fieldName)) {
        transformed.push(fieldName + ': {variables}.' + fieldName);
      } else {
        transformed.push(fieldName + ': NULL');
      }
    }
  });
  return transformed.join(', ');
};
var transformVariables = function transformVariables(params) {
  var transformed = [];
  var transformedParam = "";
  var param = '';
  var p = 0;
  var keys = Object.keys(params);
  var len = keys.length;
  var fieldValue = params[param];
  for (; p < len; ++p) {
    param = keys[p];
    transformed.push(param + ': {' + param + '}');
  }
  return transformed.join(', ');
};
var transformVariableList = function transformVariableList(variables, fields, parentID) {
  var transformed = [];
  var variableKeys = Object.keys(variables);
  fields.forEach(function (fieldName) {
    if (parentID) {
      transformed.push(fieldName + ': ' + parentID + '.' + fieldName);
    } else {
      // If no parent variable is being used, then we are on the root level, accessing parameters
      // e.g., {where}, etc., so we must add NULL values for fields that are not provided in the
      // req variables to prevent errors about expected, unprovided parameters
      if (variableKeys.includes(fieldName)) {
        transformed.push(fieldName + ': {variables}.' + fieldName);
      } else {
        transformed.push(fieldName + ': NULL');
      }
    }
  });
  return transformed.join(', ');
};
var getModelUniqueProperties = function getModelUniqueProperties(_ref15) {
  var modelType = _ref15.modelType,
      modelMap = _ref15.modelMap;

  return modelMap[modelType].uniqueProperties;
};
var buildRelationMutationName = function buildRelationMutationName(mutationType, modelType, fieldName) {
  return '' + mutationType + modelType + capitalizeName(fieldName);
};
var isAlreadyGenerated = function isAlreadyGenerated(alreadyGenerated, fieldName, mutationType) {
  if (!alreadyGenerated[fieldName]) alreadyGenerated[fieldName] = {};
  var wasGenerated = alreadyGenerated[fieldName][mutationType];
  if (!wasGenerated) alreadyGenerated[fieldName][mutationType] = {};
  return wasGenerated;
};
var isArrayArgument = function isArrayArgument(data) {
  return Array.isArray(data);
};
var isObjectArgument = function isObjectArgument(data) {
  return (typeof data === 'undefined' ? 'undefined' : _typeof(data)) === "object";
};
var mapUniqueVariableToModelType = function mapUniqueVariableToModelType(uniqueVariableMap, modelType, modelMap, variables, mutationType) {
  // initialize
  var modelInfo = modelMap[modelType];
  var uniqueProperties = modelInfo.uniqueProperties;
  if (!uniqueVariableMap[modelType]) uniqueVariableMap[modelType] = [];
  switch (mutationType) {
    case "create":
      {
        // create mutations will only ever need to use the auto-generated id field for lookup
        var fieldMap = {};
        uniqueProperties.forEach(function (fieldName) {
          fieldMap[fieldName] = variables[fieldName];
        });
        uniqueVariableMap[modelType].push(fieldMap);
        break;
      }
    case "connect":
      {
        // connect mutations will only ever need to use the auto-generated id field for lookup
        var _fieldMap = {};
        uniqueProperties.forEach(function (fieldName) {
          _fieldMap[fieldName] = variables[fieldName];
        });
        uniqueVariableMap[modelType].push(_fieldMap);
        break;
      }
    default:
      {
        break;
      }
  }
};
var validateNestedMutationsForRelationArity = function validateNestedMutationsForRelationArity(fieldName, modelType, modelMap, nestedCreate, nestedConnect) {
  if (nestedCreate && nestedConnect) {
    var model = modelMap[modelType];
    var listMap = model.listMap;
    if (!listMap[fieldName]) {
      throw Error('Field ' + fieldName + ' on model type ' + modelType + ' is not a to-many relation, so you cannot use both create and connect at the same time.');
    }
  }
};
var uniqueFieldComparisonDisjunction = function uniqueFieldComparisonDisjunction(modelName, uniqueFields) {
  var statements = [];
  uniqueFields.forEach(function (fieldName) {
    // Default to true, so that we continue along the rest of the disjuncts, knowing that there will always
    // be at least 1 match for the first provided unique field value for whatever unique fields are provided
    // for node selection - allowing which unique fields are provided, to vary from object to object in
    // a single mutation
    // https://neo4j.com/docs/developer-manual/current/cypher/clauses/where/#default-to-true-missing-property
    statements.push('(' + modelName + 'Node.' + fieldName + ' = _' + modelName + '.' + fieldName + ' OR _' + modelName + '.' + fieldName + ' IS NULL)');
  });
  return statements.join(' OR ');
};
var getGeneratedMutations = function getGeneratedMutations(parsed) {
  var operationMap = (0, _typedefs.buildOperationMap)(parsed);
  var mutations = operationMap.mutations;
  var mutationMap = mutations ? mutations.fieldMap : {};
  var generated = {};
  var mutation = {};
  Object.keys(mutationMap).forEach(function (mutationName) {
    mutation = mutationMap[mutationName];
    if (isGeneratedMutation(mutation)) {
      generated[mutationName] = mutation;
    }
  });
  return generated;
};
var capitalizeName = function capitalizeName(name) {
  return name.charAt(0).toUpperCase() + name.substr(1);
};
var buildCurrentPath = function buildCurrentPath(rootModelType, fullPathArr) {
  var fullPath = rootModelType;
  fullPathArr.forEach(function (fieldInfo) {
    var fieldName = Object.keys(fieldInfo)[0];
    var relatedModel = fieldInfo[fieldName];
    fullPath += capitalizeName(fieldName) + relatedModel;
  });
  return fullPath;
};
var isGeneratedMutation = function isGeneratedMutation(ast) {
  var directives = ast.directives;
  var isGenerated = false;
  if (directives) {
    directives.forEach(function (directive) {
      if (directive.name.value === "Neo4jGraphQLBinding") {
        isGenerated = true;
      }
    });
  }
  return isGenerated;
};
var buildMutationArguments = function buildMutationArguments(model) {
  var fields = model.fields;
  var arr = [];
  var isRequired = false;
  fields.forEach(function (field) {
    var name = field.name.value;
    if (!isRelation(field) && !hasDirective(field, "cypher") && name !== "_id") {
      arr.push(name + ': $' + name);
    }
  });
  return arr.join(", ");
};
var buildMutationVariables = function buildMutationVariables(model) {
  var fields = model.fields;
  var arr = [];
  fields.forEach(function (field) {
    var name = field.name.value;
    if (!isRelation(field) && !hasDirective(field, "cypher") && name !== "_id") {
      arr.push('$' + name + ': ' + (0, _graphql.print)(field.type));
    }
  });
  return arr.join(", ");
};
var buildMutationSelections = function buildMutationSelections(model) {
  var fields = model.fields;
  var arr = [];
  fields.forEach(function (field) {
    var name = field.name.value;
    if (!isRelation(field) && name !== "_id") {
      arr.push(name);
    }
  });
  return arr.join(" ");
};
var getModelIdFieldAST = function getModelIdFieldAST(fields) {
  // Is the first ID type field or undefined
  var idField = fields.find(function (field) {
    return (0, _typedefs.getFieldType)(field) === "ID";
  });
  // Is the first NonNullType scalar field
  var firstRequiredScalar = fields.find(function (field) {
    return (0, _typedefs.getFieldType)(field) === "String" && field.type.kind === "NonNullType";
  });
  // Prefer the ID field, then the NonNullType scalar, else undefined
  return idField ? idField : firstRequiredScalar ? firstRequiredScalar : undefined;
};
var buildMutationMap = function buildMutationMap(parsed, modelMap, generatedMutations) {
  var typeMaps = (0, _typedefs.buildTypeMaps)(parsed);
  var models = typeMaps.models;
  var mutationMap = {};
  var modelInfo = {};
  var fields = [];
  var model = {};
  Object.keys(models).forEach(function (modelName) {
    model = models[modelName].def;
    var createType = 'create' + modelName;
    if (generatedMutations[createType]) {
      mutationMap[createType] = {
        action: "create",
        model: modelName,
        cypher: 'mutation create' + modelName + '(' + buildMutationVariables(model) + ') { create' + modelName + '(' + buildMutationArguments(model) + ')}'
      };
    }
    fields = model.fields;
    var fieldName = "";
    var fieldType = undefined;
    fields.forEach(function (field) {
      if (isRelation(field)) {
        fieldName = field.name.value;
        fieldType = (0, _typedefs.getFieldType)(field);
        if (fieldName !== undefined && fieldType !== undefined) {
          var addRelationType = 'add' + modelName + capitalizeName(fieldName);
          mutationMap[addRelationType] = {
            action: "add",
            model: modelName,
            cypher: 'mutation ' + addRelationType + '($where: ' + modelName + 'WhereUniqueInput!, $' + fieldName + ': [' + fieldType + 'WhereUniqueInput!]!) { ' + addRelationType + '(where: $where, ' + fieldName + ': $' + fieldName + ') }'
          };
        }
      }
    });
  });
  return mutationMap;
};
var isListType = function isListType(field) {
  var type = field.type;
  var isListType = false;
  while (type.kind !== "NamedType") {
    if (type.kind === "ListType") {
      isListType = true;
    }
    type = type.type;
  }
  return isListType;
};
var buildModelMap = function buildModelMap(parsed) {
  var typeMaps = (0, _typedefs.buildTypeMaps)(parsed);
  var models = typeMaps.models;
  var modelMap = {};
  var fields = [];
  var model = {};
  var idFieldAST = undefined;
  var relationMap = undefined;
  var propertyMap = undefined;
  var listMap = undefined;
  var uniqueProperties = undefined;
  var modelFieldMaps = {};
  Object.keys(models).forEach(function (modelName) {
    model = models[modelName].def;
    if (!modelMap[modelName]) {
      fields = model.fields;
      idFieldAST = getModelIdFieldAST(fields);
      modelFieldMaps = getModelFieldMaps(fields);
      relationMap = modelFieldMaps.relationMap;
      propertyMap = modelFieldMaps.propertyMap;
      listMap = modelFieldMaps.listMap;
      uniqueProperties = modelFieldMaps.uniqueProperties;
      if (!modelMap[modelName] && (idFieldAST || relationMap)) modelMap[modelName] = {};
      if (relationMap) modelMap[modelName].relations = relationMap;
      if (propertyMap) modelMap[modelName].properties = propertyMap;
      if (listMap) modelMap[modelName].listMap = listMap;
      if (uniqueProperties) modelMap[modelName].uniqueProperties = uniqueProperties;
    }
  });
  return modelMap;
};
var isRelation = function isRelation(field) {
  var directives = field.directives;
  var isRelation = false;
  directives.forEach(function (directive) {
    if (directive.name.value === "relation") {
      isRelation = true;
    }
  });
  return isRelation;
};
var hasDirective = function hasDirective(field, match) {
  var directives = field.directives;
  var has = false;
  directives.forEach(function (directive) {
    if (directive.name.value === match) {
      has = true;
    }
  });
  return has;
};
var removeVariableCounterPrefix = function removeVariableCounterPrefix(variableName) {
  var firstUnderscoreSkipped = variableName ? variableName.substr(1) : false;
  var secondUnderscoreIndex = firstUnderscoreSkipped ? firstUnderscoreSkipped.indexOf('_') : -1;
  return secondUnderscoreIndex !== -1 ? variableName.substr(secondUnderscoreIndex + 2) : variableName;
};
var prepareVariables = function prepareVariables(action, variables) {
  var prepared = {};
  switch (action) {
    case "create":
      {
        Object.keys(variables).forEach(function (variableName) {
          prepared[removeVariableCounterPrefix(variableName)] = variables[variableName];
        });
        return prepared.data;
      }
    case "add":
      {
        Object.keys(variables).forEach(function (variableName) {
          prepared[removeVariableCounterPrefix(variableName)] = variables[variableName];
        });
        return prepared;
        break;
      }
    default:
      {
        break;
      }
  }
};
var getMutationNameFromOperation = function getMutationNameFromOperation(operation) {
  return operation.query.definitions[0].selectionSet.selections[0].name.value;
};
var buildResultMap = function buildResultMap(models, modelMap) {
  var resultMap = {};
  var uniqueFieldsOfModel = [];
  Object.keys(models).forEach(function (name) {
    uniqueFieldsOfModel = modelMap[name].uniqueProperties;
    if (!resultMap[name]) resultMap[name] = {};
    uniqueFieldsOfModel.forEach(function (fieldName) {
      resultMap[name][fieldName] = arrayToObject(models[name], fieldName);
    });
  });
  return resultMap;
};
// From: https://medium.com/dailyjs/rewriting-javascript-converting-an-array-of-objects-to-an-object-ec579cafbfc7
var arrayToObject = function arrayToObject(arr, keyField) {
  return Object.assign.apply(Object, [{}].concat(_toConsumableArray(arr.map(function (item) {
    return _defineProperty({}, item[keyField], item);
  }))));
};
var mergeResultWithVariables = function mergeResultWithVariables(variables, modelType, modelMap, uniqueModelFieldMap, mutationType) {
  // Injection
  switch (mutationType) {
    case "create":
      {
        variables = Object.assign(variables, uniqueModelFieldMap[modelType]["id"][variables.id]);
        break;
      }
    case "connect":
      {
        var uniqueProperties = modelMap[modelType].uniqueProperties[0];
        var firstVariableKey = Object.keys(variables)[0];
        var dataMap = uniqueModelFieldMap[modelType][firstVariableKey];
        var uniqueFieldValue = variables[firstVariableKey];
        variables = Object.assign(variables, dataMap[uniqueFieldValue]);
        break;
      }
    default:
      {
        break;
      }
  }
  // Recursion
  Object.keys(variables).forEach(function (fieldName) {
    var nestedCreate = variables[fieldName].create;
    var nestedConnect = variables[fieldName].connect;
    if (nestedCreate) {
      variables[fieldName] = variables[fieldName].create;
      var relatedModelType = getRelatedModelType({ modelMap: modelMap, modelType: modelType, fieldName: fieldName });
      if (isArrayArgument(nestedCreate)) {
        nestedCreate.forEach(function (relatedModelVariables) {
          mergeResultWithVariables(relatedModelVariables, relatedModelType, modelMap, uniqueModelFieldMap, "create");
        });
      } else if (isObjectArgument(nestedCreate)) {
        mergeResultWithVariables(nestedCreate, relatedModelType, modelMap, uniqueModelFieldMap, "create");
      }
    }
    if (nestedConnect) {
      var _relatedModelType2 = getRelatedModelType({ modelMap: modelMap, modelType: modelType, fieldName: fieldName });
      if (isArrayArgument(nestedConnect)) {
        if (nestedCreate) {
          variables[fieldName] = variables[fieldName].concat(nestedConnect);
        } else {
          variables[fieldName] = variables[fieldName].connect;
        }
        nestedConnect.forEach(function (relatedModelVariables) {
          mergeResultWithVariables(relatedModelVariables, _relatedModelType2, modelMap, uniqueModelFieldMap, "connect");
        });
      } else if (isObjectArgument(nestedConnect)) {
        if (nestedCreate) {
          variables[fieldName] = Object.assign(variables[fieldName], nestedConnect);
        } else {
          variables[fieldName] = variables[fieldName].connect;
        }
        mergeResultWithVariables(nestedConnect, _relatedModelType2, modelMap, uniqueModelFieldMap, "connect");
      }
    }
  });
};
var formatResult = function formatResult(_ref17) {
  var variables = _ref17.variables,
      mutationType = _ref17.mutationType,
      modelMap = _ref17.modelMap,
      modelType = _ref17.modelType,
      mutationName = _ref17.mutationName,
      generatedMutations = _ref17.generatedMutations,
      result = _ref17.result,
      logRequests = _ref17.logRequests;

  var data = { data: {} };
  switch (mutationType) {
    case "create":
      {
        if (generatedMutations[mutationName]) {
          if (result && result.records && result.records[0] && result.records[0]._fields) {
            var uniqueModels = result.records[0]._fields[0];
            var uniqueModelFieldMap = buildResultMap(uniqueModels, modelMap);
            mergeResultWithVariables(variables, modelType, modelMap, uniqueModelFieldMap, "create");
            data.data[mutationName] = variables;
            if (logRequests) logResponse(data);
          }
        }
        break;
      }
    default:
      {
        data.data[mutationName] = result.records[0]._fields[0][mutationName];
        if (logRequests) logResponse(data);
        break;
      }
  }
  return data;
};