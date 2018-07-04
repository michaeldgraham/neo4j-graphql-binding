"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getFieldType = exports.getNamedType = exports.buildOperationMap = exports.buildTypeMaps = exports.buildNestedMutationInputType = exports.buildRelationalFieldNestedInputTypes = exports.getOperationTypes = exports.buildResolvers = exports.buildTypeDefs = undefined;

var _graphql = require("graphql");

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var buildTypeDefs = exports.buildTypeDefs = function buildTypeDefs(_ref) {
  var typeDefs = _ref.typeDefs,
      _ref$query = _ref.query,
      query = _ref$query === undefined ? true : _ref$query,
      _ref$mutation = _ref.mutation,
      mutation = _ref$mutation === undefined ? true : _ref$mutation,
      _ref$idFields = _ref.idFields,
      idFields = _ref$idFields === undefined ? true : _ref$idFields,
      _ref$isForRemote = _ref.isForRemote,
      isForRemote = _ref$isForRemote === undefined ? false : _ref$isForRemote;

  var parsed = (0, _graphql.parse)(typeDefs);
  var typeMaps = buildTypeMaps(parsed);
  var types = typeMaps.types;
  var models = typeMaps.models;
  parsed = possiblyBuildSchemaDefinition(parsed, typeMaps, query, mutation);
  parsed = possiblyBuildOperationTypes(parsed, typeMaps, query, mutation);
  var operationMaps = buildOperationMap(parsed);
  var queries = operationMaps.queries;
  var mutations = operationMaps.mutations;
  var model = {};
  var orderingType = {};
  var filterType = {};
  var modelType = {};
  var queryType = {};
  var mutationType = {};
  var relationalFieldInputTypes = {};
  var relationMutations = [];
  Object.keys(models).forEach(function (modelName) {
    model = models[modelName];
    // Local: Used in the graphql validation of client requests
    if (!isForRemote) {
      // Possibly inject id field
      if (idFields === true) model.def = injectIdField(modelName, model.def);
      // Build model type with field arguments for nested query support
      modelType = buildModelType(modelName, model.def, models);
      parsed.definitions[model.index] = modelType;
      // Build query type
      if (query && queries && queries.fieldMap && !queries.fieldMap[modelName]) {
        queryType = buildQueryType(modelName, model.def, models);
        parsed.definitions[queries.index].fields.push(queryType);
      }
      // Build ordering input type to be used in query field arguments
      orderingType = buildOrderingType(modelName, model.def, models);
      parsed.definitions.push(orderingType);
      // Build filter input type used in filter argument of neo4j-graphql query types
      filterType = buildFilterType(modelName, model.def, models);
      parsed.definitions.push(filterType);"";
    } else {
      // REMOTE typeDefs
      parsed.definitions[model.index].fields = augmentRemoteModelFields(modelName, model.def, models);
    }
    // Built for both local and remote
    // These are the input types needed for the creation of One or Many types
    // when using nested mutations, e.g., PersonCreateOneInput / PersonCreateManyInput
    // Build query types for both local and remote
    // If isForRemote, then add cypher directive statements
    // so the IDL call overwrites the neo4j-graphql generated mutations, for now
    if (mutation && mutations && mutations.fieldMap && !mutations.fieldMap[modelName]) {
      var _parsed$definitions, _parsed$definitions2, _parsed$definitions$m, _parsed$definitions$m2;

      relationalFieldInputTypes = buildRelationalFieldNestedInputTypes({
        action: "create",
        modelName: modelName,
        isForRemote: isForRemote
      });
      (_parsed$definitions = parsed.definitions).push.apply(_parsed$definitions, _toConsumableArray(relationalFieldInputTypes));

      relationalFieldInputTypes = buildRelationalFieldNestedInputTypes({
        action: "connect",
        modelName: modelName,
        isForRemote: isForRemote
      });
      (_parsed$definitions2 = parsed.definitions).push.apply(_parsed$definitions2, _toConsumableArray(relationalFieldInputTypes));

      // Build CREATE mutation
      mutationType = buildMutationType("create", modelName, mutations, model.def, models, isForRemote);
      if (mutationType) (_parsed$definitions$m = parsed.definitions[mutations.index].fields).push.apply(_parsed$definitions$m, _toConsumableArray(mutationType));

      // Build CONNECT mutation
      mutationType = buildMutationType("connect", modelName, mutations, model.def, models, isForRemote);
      if (mutationType) (_parsed$definitions$m2 = parsed.definitions[mutations.index].fields).push.apply(_parsed$definitions$m2, _toConsumableArray(mutationType));

      // Build input types used for nested CREATE mutations
      parsed.definitions.push(buildNestedMutationInputType({
        action: "create",
        modelName: modelName,
        mutations: mutations,
        modelAST: model.def,
        isForRemote: isForRemote
      }));

      parsed.definitions.push(buildNestedMutationInputType({
        action: "connect",
        modelName: modelName,
        mutations: mutations,
        modelAST: model.def,
        isForRemote: isForRemote
      }));
    }
  });
  return (0, _graphql.print)(parsed);
};
var buildResolvers = exports.buildResolvers = function buildResolvers(_ref2) {
  var typeDefs = _ref2.typeDefs,
      resolvers = _ref2.resolvers,
      query = _ref2.query,
      mutation = _ref2.mutation,
      _ref2$bindingKey = _ref2.bindingKey,
      bindingKey = _ref2$bindingKey === undefined ? "neo4j" : _ref2$bindingKey;

  if (typeDefs === undefined) {
    throw Error("buildNeo4jResolvers: typeDefs are undefined.");
  }
  if (resolvers === undefined) {
    throw Error("buildNeo4jResolvers: resolvers are undefined.");
  }
  var augmentedResolvers = {};
  var parsed = (0, _graphql.parse)(typeDefs);
  var operationMaps = buildOperationMap(parsed);
  if (!resolvers) {
    resolvers = {};
  }
  var queries = operationMaps.queries;
  query = typeof query == "boolean" ? query : true;
  mutation = typeof mutation == "boolean" ? mutation : true;
  if (typeof bindingKey !== "string") {
    throw Error("buildNeo4jResolvers: bindingKey must be a String value.");
  }
  if (query && queries && queries.fieldMap) {
    if (augmentedResolvers.Query === undefined) {
      augmentedResolvers.Query = {};
    }
    var queryTypeAST = {};
    Object.keys(queries.fieldMap).forEach(function (queryType) {
      queryTypeAST = queries.fieldMap[queryType];
      if (hasDirective(queryTypeAST, "cypher") || hasDirective(queryTypeAST, "Neo4jGraphQLBinding")) {
        if (resolvers.Query === undefined || resolvers.Query[queryType] === undefined) {
          augmentedResolvers.Query[queryType] = function (obj, params, ctx, info) {
            return ctx[bindingKey].query[info.fieldName](params, info);
          };
        }
      }
    });
  }
  var mutations = operationMaps.mutations;
  if (mutation && mutations && mutations.fieldMap) {
    if (augmentedResolvers.Mutation === undefined) {
      augmentedResolvers.Mutation = {};
    }
    var mutationTypeAST = {};
    Object.keys(mutations.fieldMap).forEach(function (mutationType) {
      mutationTypeAST = mutations.fieldMap[mutationType];
      if (hasDirective(mutationTypeAST, "cypher") || hasDirective(mutationTypeAST, "Neo4jGraphQLBinding")) {
        if (resolvers.Mutation === undefined || resolvers.Mutation[mutationType] === undefined) {
          augmentedResolvers.Mutation[mutationType] = function (obj, params, ctx, info) {
            return ctx[bindingKey].mutation[info.fieldName](params, info);
          };
        }
      }
    });
  }
  return augmentedResolvers;
};
var getOperationTypes = exports.getOperationTypes = function getOperationTypes(parsed) {
  var arr = parsed ? parsed.definitions : [];
  var len = arr.length;
  var i = 0;
  var obj = {};
  var query = false;
  var mutation = false;
  for (; i < len; ++i) {
    obj = arr[i];
    if (isObjectType(obj)) {
      if (obj.name.value === "Query") {
        query = obj;
      } else if (obj.name.value === "Mutation") {
        mutation = obj;
      }
    }
  }
  return {
    query: query,
    mutation: mutation
  };
};
var buildRelationalFieldNestedInputTypes = exports.buildRelationalFieldNestedInputTypes = function buildRelationalFieldNestedInputTypes(_ref3) {
  var action = _ref3.action,
      modelName = _ref3.modelName,
      isForRemote = _ref3.isForRemote;

  var inputs = [];
  // TODO only add those you need, check the arity of the value...
  switch (action) {
    case "create":
      {
        inputs.push({
          "kind": "InputObjectTypeDefinition",
          "name": {
            "kind": "Name",
            "value": modelName + "CreateManyInput"
          },
          "directives": [],
          "fields": [
          // support nested create
          {
            "kind": "InputValueDefinition",
            "name": {
              "kind": "Name",
              "value": "create"
            },
            "type": {
              "kind": "ListType",
              "type": {
                "kind": "NonNullType",
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": modelName + "CreateInput"
                  }
                }
              }
            },
            "directives": []
          },
          // supports nested connect
          {
            "kind": "InputValueDefinition",
            "name": {
              "kind": "Name",
              "value": "connect"
            },
            "type": {
              "kind": "ListType",
              "type": {
                "kind": "NonNullType",
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": modelName + "WhereUniqueInput"
                  }
                }
              }
            },
            "directives": []
          }]
        });
        inputs.push({
          "kind": "InputObjectTypeDefinition",
          "name": {
            "kind": "Name",
            "value": modelName + "CreateOneInput"
          },
          "directives": [],
          "fields": [
          // supports nested create
          {
            "kind": "InputValueDefinition",
            "name": {
              "kind": "Name",
              "value": "create"
            },
            "type": {
              "kind": "NamedType",
              "name": {
                "kind": "Name",
                "value": modelName + "CreateInput"
              }
            },
            "directives": []
          },
          // supports nested connect
          {
            "kind": "InputValueDefinition",
            "name": {
              "kind": "Name",
              "value": "connect"
            },
            "type": {
              "kind": "NamedType",
              "name": {
                "kind": "Name",
                "value": modelName + "WhereUniqueInput"
              }
            },
            "directives": []
          }]
        });
        break;
      }
    case "connect":
      {
        inputs.push({
          "kind": "InputObjectTypeDefinition",
          "name": {
            "kind": "Name",
            "value": modelName + "ConnectManyInput"
          },
          "directives": [],
          "fields": [
          // supports nested connect
          {
            "kind": "InputValueDefinition",
            "name": {
              "kind": "Name",
              "value": "connect"
            },
            "type": {
              "kind": "ListType",
              "type": {
                "kind": "NonNullType",
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": modelName + "WhereUniqueInput"
                  }
                }
              }
            },
            "directives": []
          },
          // supports nested create
          {
            "kind": "InputValueDefinition",
            "name": {
              "kind": "Name",
              "value": "create"
            },
            "type": {
              "kind": "ListType",
              "type": {
                "kind": "NonNullType",
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": modelName + "CreateInput"
                  }
                }
              }
            },
            "directives": []
          }]
        });
        inputs.push({
          "kind": "InputObjectTypeDefinition",
          "name": {
            "kind": "Name",
            "value": modelName + "ConnectOneInput"
          },
          "directives": [],
          "fields": [
          // supports nested connect
          {
            "kind": "InputValueDefinition",
            "name": {
              "kind": "Name",
              "value": "connect"
            },
            "type": {
              "kind": "NamedType",
              "name": {
                "kind": "Name",
                "value": modelName + "WhereUniqueInput"
              }
            },
            "directives": []
          },
          // supports nested create
          {
            "kind": "InputValueDefinition",
            "name": {
              "kind": "Name",
              "value": "create"
            },
            "type": {
              "kind": "NamedType",
              "name": {
                "kind": "Name",
                "value": modelName + "CreateInput"
              }
            },
            "directives": []
          }]
        });
      }
    default:
      {
        break;
      }
  }
  return inputs;
};
var buildNestedMutationInputType = exports.buildNestedMutationInputType = function buildNestedMutationInputType(_ref4) {
  var action = _ref4.action,
      modelName = _ref4.modelName,
      modelAST = _ref4.modelAST,
      mutations = _ref4.mutations,
      isForRemote = _ref4.isForRemote;

  // Prevent overwriting any existing mutation of the same name
  if (mutations.fieldMap["" + action + modelName] === undefined) {
    var inputFields = [];
    var relatedModelName = "";
    var arity = "";
    var fieldName = "";
    modelAST.fields.forEach(function (field) {
      fieldName = field.name.value;
      // computed fields using cypher directives are not used
      if (!hasDirective(field, "cypher")) {
        switch (action) {
          case "create":
            {
              // Do not use "id" field unless for remote typeDefs
              if (isForRemote || fieldName !== "id") {
                if (isRelation(field)) {
                  relatedModelName = getFieldType(field);
                  arity = "One";
                  if (isListType(field) && relatedModelName) {
                    arity = "Many";
                  }
                  inputFields.push({
                    "kind": "InputValueDefinition",
                    "name": {
                      "kind": "Name",
                      "value": fieldName
                    },
                    "type": {
                      "kind": "NamedType",
                      "name": {
                        "kind": "Name",
                        "value": relatedModelName + "Create" + arity + "Input"
                      }
                    },
                    "directives": []
                  });
                } else {
                  field.kind = "InputValueDefinition";
                  inputFields.push(field);
                }
              }
              break;
            }
          case "connect":
            {
              if (fieldName === "id" || hasDirective(field, "unique") || hasDirective(field, "isUnique")) {
                var fieldType = getFieldType(field);
                var type = {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": fieldType
                  }
                };
                if (isListType(field)) {
                  type = {
                    "kind": "ListType",
                    "type": {
                      "kind": "NamedType",
                      "name": {
                        "kind": "Name",
                        "value": fieldType
                      }
                    }
                  };
                }
                inputFields.push({
                  "kind": "InputValueDefinition",
                  "name": {
                    "kind": "Name",
                    "value": fieldName
                  },
                  "type": type,
                  "directives": []
                });
              }
              break;
            }
          default:
            {
              break;
            }
        }
      }
    });
    switch (action) {
      case "create":
        {
          return {
            "kind": "InputObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": modelName + "CreateInput"
            },
            "directives": [],
            "fields": inputFields
          };
        }
      case "connect":
        {
          return {
            "kind": "InputObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": modelName + "WhereUniqueInput"
            },
            "directives": [],
            "fields": inputFields
          };
        }
      default:
        {
          break;
        }
    }
  }
  return undefined;
};
var buildTypeMaps = exports.buildTypeMaps = function buildTypeMaps(parsed) {
  var arr = parsed ? parsed.definitions : [];
  var len = arr.length;
  var i = 0;
  var definition = {};
  var name = "";
  var models = {};
  var types = {};
  for (; i < len; ++i) {
    definition = arr[i];
    if (isObjectType(definition)) {
      if (isModel(definition)) {
        definition = reduceNestedListTypes(definition);
        if (!models[definition.name.value]) {
          models[definition.name.value] = {
            index: i,
            def: definition
          };
        }
      } else if (definition.name.value !== "Query" && definition.name.value !== "Mutation") {
        if (!types[definition.name.value]) {
          types[definition.name.value] = {
            index: i,
            def: definition
          };
        }
      }
    }
  }
  return {
    models: models,
    types: types
  };
};
var buildOperationMap = exports.buildOperationMap = function buildOperationMap(parsed) {
  var arr = parsed ? parsed.definitions : [];
  var len = arr.length;
  var i = 0;
  var obj = {};
  var name = "";
  var queries = undefined;
  var mutations = undefined;
  for (; i < len; ++i) {
    obj = arr[i];
    if (isObjectType(obj)) {
      if (obj.name.value === "Query") {
        queries = {
          index: i,
          fieldMap: buildFieldMap(obj.fields)
        };
      } else if (obj.name.value === "Mutation") {
        mutations = {
          index: i,
          fieldMap: buildFieldMap(obj.fields)
        };
      }
    }
  }
  return {
    queries: queries,
    mutations: mutations
  };
};
var getNamedType = exports.getNamedType = function getNamedType(definition) {
  var type = definition.type;
  while (type.kind !== "NamedType") {
    type = type.type;
  }return type;
};
var getFieldType = exports.getFieldType = function getFieldType(field) {
  return field ? getNamedType(field).name.value : undefined;
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
var injectIdField = function injectIdField(modelName, model) {
  var len = model.fields.length;
  var idField = undefined;
  var idFieldIndex = -1;
  var i = 0;
  var field = {};
  for (; i < len; ++i) {
    field = model.fields[i];
    if (field.name.value === "id") {
      idField = field;
      idFieldIndex = i;
    }
  }
  if (idField) {
    var printed = (0, _graphql.print)(idField);
    // If it isn't either of these two patterns, error
    if (printed !== "id: ID! @unique" && printed !== "id: ID! @isUnique") {
      throw Error("id field on type " + modelName + " has invalid format '" + printed + "' Required format: 'id: ID!'");
    }
    // Otherwise, if id field exists but is not the first field
    if (idFieldIndex > 0) {
      // then remove it
      model.fields.splice(idFieldIndex, 1);
      // and make it the first field
      model.fields.unshift(idField);
    }
  } else {
    // Add as first element to ensure that neo4j-graphql picks it up
    model.fields.unshift({
      "kind": "FieldDefinition",
      "name": {
        "kind": "Name",
        "value": "id"
      },
      "arguments": [],
      "type": {
        "kind": "NonNullType",
        "type": {
          "kind": "NamedType",
          "name": {
            "kind": "Name",
            "value": "ID"
          }
        }
      },
      "directives": [{
        "kind": "Directive",
        "name": {
          "kind": "Name",
          "value": "unique"
        },
        "arguments": []
      }]
    });
  }
  return model;
};
var buildRelationMutations = function buildRelationMutations(_ref5) {
  var action = _ref5.action,
      modelAST = _ref5.modelAST,
      modelName = _ref5.modelName,
      mutations = _ref5.mutations;

  var relationMutations = [];
  var fieldName = "";
  modelAST.fields.forEach(function (field) {
    if (isRelation(field)) {
      fieldName = field.name.value;
      var capitalized = fieldName.charAt(0).toUpperCase() + fieldName.substr(1);
      var relationMutationName = "" + action + modelName + capitalized;
      // Prevent overwriting any existing mutation of the same name
      if (mutations.fieldMap[relationMutationName] === undefined) {
        if (action === "add") {
          relationMutations.push({
            "kind": "FieldDefinition",
            "name": {
              "kind": "Name",
              "value": relationMutationName
            },
            "arguments": [{
              "kind": "InputValueDefinition",
              "name": {
                "kind": "Name",
                "value": "id"
              },
              "type": {
                "kind": "NonNullType",
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "ID"
                  }
                }
              },
              "directives": []
            }, {
              "kind": "InputValueDefinition",
              "name": {
                "kind": "Name",
                "value": fieldName
              },
              "type": {
                "kind": "NonNullType",
                "type": {
                  "kind": "ListType",
                  "type": {
                    "kind": "NonNullType",
                    "type": {
                      "kind": "NamedType",
                      "name": {
                        "kind": "Name",
                        "value": "ID"
                      }
                    }
                  }
                }
              },
              "directives": []
            }],
            "type": {
              "kind": "NamedType",
              "name": {
                "kind": "Name",
                "value": "String"
              }
            },
            "directives": [{
              "kind": "Directive",
              "name": {
                "kind": "Name",
                "value": "Neo4jGraphQLBinding"
              },
              "arguments": []
            }]
          });
        }
      }
    }
  });
  return relationMutations;
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
var isObjectType = function isObjectType(def) {
  return def && def.kind === "ObjectTypeDefinition";
};
var isModel = function isModel(def) {
  var directives = def.directives ? def.directives : [];
  var len = directives.length;
  var d = 0;
  var directive = {};
  var name = "";
  var isModel = false;
  for (; d < len; ++d) {
    directive = directives[d];
    name = directive.name.value;
    if (name === "model") {
      isModel = true;
    }
  }
  return isModel;
};
var possiblyBuildSchemaDefinition = function possiblyBuildSchemaDefinition(parsed, typeMaps, queries, mutations) {
  if (Object.keys(typeMaps.models).length > 0) {
    var schemaDefinition = getSchemaDefinition(parsed);
    if (schemaDefinition && schemaDefinition.def && schemaDefinition.index >= 0) {
      var schemaDefOperationIndex = schemaDefinition.index;
      var _operationTypes = schemaDefinition.def.operationTypes;
      var query = false;
      var mutation = false;
      _operationTypes.forEach(function (operation) {
        if (operation.operation === "query" && operation.type.name.value === "Query") {
          query = true;
        } else if (operation.operation === "mutation" && operation.type.name.value === "Mutation") {
          mutation = true;
        }
      });
      if (!query && queries) {
        parsed.definitions[schemaDefOperationIndex].operationTypes.push(buildOperationTypeDefinition({
          operation: "query",
          name: "Query"
        }));
      }
      if (!mutation && mutations) {
        parsed.definitions[schemaDefOperationIndex].operationTypes.push(buildOperationTypeDefinition({
          operation: "mutation",
          name: "Mutation"
        }));
      }
    } else if (schemaDefinition === undefined) {
      parsed.definitions.push(buildSchemaDefinition({
        query: queries,
        mutation: mutations
      }));
    }
  }
  return parsed;
};
var possiblyBuildOperationTypes = function possiblyBuildOperationTypes(parsed, typeMaps, queries, mutations) {
  if (Object.keys(typeMaps.models).length > 0) {
    var _operationTypes2 = getOperationTypes(parsed);
    if (!_operationTypes2.query && queries) {
      parsed.definitions.push(buildObjectTypeDefinition({
        name: "Query"
      }));
    }
    if (!_operationTypes2.mutation && mutations) {
      parsed.definitions.push(buildObjectTypeDefinition({
        name: "Mutation"
      }));
    }
  }
  return parsed;
};
var reduceNestedListTypes = function reduceNestedListTypes(model) {
  var fields = model.fields;
  var len = fields.length;
  var f = 0;
  var field = {};
  for (; f < len; ++f) {
    field = fields[f];
    if (field.type.kind === "ListType") {
      fields[f] = reduceListTypes(field);
    }
  }
  return model;
};
var getSchemaDefinition = function getSchemaDefinition(parsed) {
  var defs = parsed ? parsed.definitions : [];
  var len = defs.length;
  var i = 0;
  for (; i < len; ++i) {
    if (isSchemaDefinition(defs[i])) {
      return {
        def: defs[i],
        index: i
      };
    }
  }
  return undefined;
};
var buildSchemaDefinition = function buildSchemaDefinition(_ref6) {
  var query = _ref6.query,
      mutation = _ref6.mutation;

  if (!query && !mutation) return undefined;
  return {
    "kind": "SchemaDefinition",
    "directives": [],
    "operationTypes": operationTypes({
      query: query,
      mutation: mutation
    })
  };
};
var operationTypes = function operationTypes(_ref7) {
  var query = _ref7.query,
      mutation = _ref7.mutation;

  var operationTypes = [];
  if (query) {
    operationTypes.push(buildOperationTypeDefinition({
      operation: "query",
      name: "Query"
    }));
  }
  if (mutation) {
    operationTypes.push(buildOperationTypeDefinition({
      operation: "mutation",
      name: "Mutation"
    }));
  }
  return operationTypes;
};
var reduceListTypes = function reduceListTypes(field) {
  if (field.type.kind === "ListType" && field.type.type && field.type.type.kind === "ListType") {
    var namedType = getNamedType(field);
    field.type = {
      kind: "ListType",
      type: namedType
    };
  }
  return field;
};
var buildModelFields = function buildModelFields(modelName, definition, models) {
  var modelFields = [{
    "kind": "FieldDefinition",
    "name": {
      "kind": "Name",
      "value": "_id"
    },
    "arguments": [],
    "type": {
      "kind": "NamedType",
      "name": {
        "kind": "Name",
        "value": "Int"
      }
    },
    "directives": []
  }];
  var arr = definition.fields;
  var len = arr.length;
  var i = 0;
  var obj = {};
  var name = {};
  var type = {};
  for (; i < len; ++i) {
    obj = arr[i];
    name = obj.name;
    type = obj.type;
    if (isModelType(obj, models)) {
      modelFields.push({
        "kind": "FieldDefinition",
        "name": {
          "kind": "Name",
          "value": name.value
        },
        "arguments": buildModelFieldArguments(modelName, obj, models),
        "type": type,
        "directives": obj.directives
      });
    } else {
      modelFields.push({
        "kind": "FieldDefinition",
        "name": {
          "kind": "Name",
          "value": name.value
        },
        "arguments": [],
        "type": type,
        "directives": obj.directives
      });
    }
  }
  return modelFields;
};
var augmentRemoteModelFields = function augmentRemoteModelFields(modelName, definition, models) {
  var fields = definition.fields;
  var len = fields.length;
  var i = 0;
  var obj = {};
  var name = {};
  var type = {};
  var idField = undefined;
  var idFieldIndex = -1;
  for (; i < len; ++i) {
    obj = fields[i];
    name = obj.name;
    type = obj.type;
    if (name.value === "id") {
      idField = obj;
      idFieldIndex = i;
    }
  }
  if (idField) {
    var printed = (0, _graphql.print)(idField);
    // If it isn't either of these two patterns, error
    if (printed !== "id: ID! @unique" && printed !== "id: ID! @isUnique") {
      throw Error("id field on type " + modelName + " has invalid format '" + printed + "' Required format: 'id: ID!'");
    }
    // Otherwise, if id field exists but is not the first field
    if (idFieldIndex > 0) {
      // then remove it
      fields.splice(idFieldIndex, 1);
      // and make it the first field
      fields.unshift(idField);
    }
  } else {
    // Add as first element to ensure that neo4j-graphql picks it up
    fields.unshift({
      "kind": "FieldDefinition",
      "name": {
        "kind": "Name",
        "value": "id"
      },
      "arguments": [],
      "type": {
        "kind": "NonNullType",
        "type": {
          "kind": "NamedType",
          "name": {
            "kind": "Name",
            "value": "ID"
          }
        }
      },
      "directives": []
    });
  }
  return fields;
};
var possiblyRemoveNonNullType = function possiblyRemoveNonNullType(type) {
  if (type.kind === "NonNullType") {
    type = type.type;
  }
  return type;
};
var buildModelFieldArguments = function buildModelFieldArguments(modelName, field, models) {
  var kind = field.type.kind;
  var relatedModelType = getFieldType(field);
  var neo4jArgsForNamedType = [{
    "kind": "InputValueDefinition",
    "name": {
      "kind": "Name",
      "value": "orderBy"
    },
    "type": {
      "kind": "ListType",
      "type": {
        "kind": "NamedType",
        "name": {
          "kind": "Name",
          "value": "_" + relatedModelType + "Ordering"
        }
      }
    },
    "directives": []
  }, {
    "kind": "InputValueDefinition",
    "name": {
      "kind": "Name",
      "value": "filter"
    },
    "type": {
      "kind": "ListType",
      "type": {
        "kind": "NamedType",
        "name": {
          "kind": "Name",
          "value": "_" + relatedModelType + "Filter"
        }
      }
    },
    "directives": []
  }];
  var neo4jArgsForListType = [{
    "kind": "InputValueDefinition",
    "name": {
      "kind": "Name",
      "value": "filter"
    },
    "type": {
      "kind": "ListType",
      "type": {
        "kind": "NamedType",
        "name": {
          "kind": "Name",
          "value": "_" + relatedModelType + "Filter"
        }
      }
    },
    "directives": []
  }, {
    "kind": "InputValueDefinition",
    "name": {
      "kind": "Name",
      "value": "orderBy"
    },
    "type": {
      "kind": "ListType",
      "type": {
        "kind": "NamedType",
        "name": {
          "kind": "Name",
          "value": "_" + relatedModelType + "Ordering"
        }
      }
    },
    "directives": []
  }, {
    "kind": "InputValueDefinition",
    "name": {
      "kind": "Name",
      "value": "_id"
    },
    "type": {
      "kind": "NamedType",
      "name": {
        "kind": "Name",
        "value": "Int"
      }
    },
    "directives": []
  }, {
    "kind": "InputValueDefinition",
    "name": {
      "kind": "Name",
      "value": "_ids"
    },
    "type": {
      "kind": "ListType",
      "type": {
        "kind": "NamedType",
        "name": {
          "kind": "Name",
          "value": "Int"
        }
      }
    },
    "directives": []
  }, {
    "kind": "InputValueDefinition",
    "name": {
      "kind": "Name",
      "value": "first"
    },
    "type": {
      "kind": "NamedType",
      "name": {
        "kind": "Name",
        "value": "Int"
      }
    },
    "directives": []
  }, {
    "kind": "InputValueDefinition",
    "name": {
      "kind": "Name",
      "value": "offset"
    },
    "type": {
      "kind": "NamedType",
      "name": {
        "kind": "Name",
        "value": "Int"
      }
    },
    "directives": []
  }];
  var relatedModel = models[relatedModelType];
  if (relatedModel) {
    var args = [];
    var arr = relatedModel.def.fields;
    var len = arr.length;
    var i = 0;
    var obj = {};
    var name = {};
    var type = {};
    for (; i < len; ++i) {
      obj = arr[i];
      name = obj.name;
      type = obj.type;
      if (!isModelType(obj, models)) {
        type = possiblyRemoveNonNullType(type);
        args.push({
          "kind": "InputValueDefinition",
          "name": {
            "kind": "Name",
            "value": name.value
          },
          "type": type,
          "directives": []
        });
        args.push({
          "kind": "InputValueDefinition",
          "name": {
            "kind": "Name",
            "value": name.value + "s"
          },
          "type": {
            "kind": "ListType",
            "type": type
          },
          "directives": []
        });
      }
    }
    if (kind === "ListType") {
      args.push.apply(args, neo4jArgsForListType);
    } else if (kind === "NamedType") {
      args.push.apply(args, neo4jArgsForNamedType);
    }
    return args;
  }
  return [];
};
var buildModelType = function buildModelType(modelName, obj, models) {
  return {
    "kind": "ObjectTypeDefinition",
    "name": {
      "kind": "Name",
      "value": modelName
    },
    "interfaces": [],
    "directives": [{
      "kind": "Directive",
      "name": {
        "kind": "Name",
        "value": "model"
      },
      "arguments": []
    }],
    "fields": buildModelFields(modelName, obj, models)
  };
};
var buildQueryTypeArguments = function buildQueryTypeArguments(modelName, definition, models) {
  var args = [];
  var arr = definition.fields;
  var len = arr.length;
  var i = 0;
  var obj = {};
  var name = {};
  var type = {};
  for (; i < len; ++i) {
    obj = arr[i];
    name = obj.name;
    type = obj.type;
    // Only add query arguments for non-relational fields
    // because those are otherwise handled by the generated field args
    // added to the model type
    if (!isModelType(obj, models)) {
      // Prevent NonNullType fields from being required on generated query types
      type = possiblyRemoveNonNullType(type);
      // Add argument for field
      args.push({
        "kind": "InputValueDefinition",
        "name": {
          "kind": "Name",
          "value": name.value
        },
        "type": type,
        "directives": []
      });
      // Add list type argument for field
      args.push({
        "kind": "InputValueDefinition",
        "name": {
          "kind": "Name",
          "value": name.value + "s"
        },
        "type": {
          "kind": "ListType",
          "type": type
        },
        "directives": []
      });
    }
  }
  // Add field group for auto generated query types
  var neo4jArgs = [{
    "kind": "InputValueDefinition",
    "name": {
      "kind": "Name",
      "value": "filter"
    },
    "type": {
      "kind": "NamedType",
      "name": {
        "kind": "Name",
        "value": "_" + modelName + "Filter"
      }
    },
    "directives": []
  }, {
    "kind": "InputValueDefinition",
    "name": {
      "kind": "Name",
      "value": "orderBy"
    },
    "type": {
      "kind": "ListType",
      "type": {
        "kind": "NamedType",
        "name": {
          "kind": "Name",
          "value": "_" + modelName + "Ordering"
        }
      }
    },
    "directives": []
  }, {
    "kind": "InputValueDefinition",
    "name": {
      "kind": "Name",
      "value": "_id"
    },
    "type": {
      "kind": "NamedType",
      "name": {
        "kind": "Name",
        "value": "Int"
      }
    },
    "directives": []
  }, {
    "kind": "InputValueDefinition",
    "name": {
      "kind": "Name",
      "value": "_ids"
    },
    "type": {
      "kind": "ListType",
      "type": {
        "kind": "NamedType",
        "name": {
          "kind": "Name",
          "value": "Int"
        }
      }
    },
    "directives": []
  }, {
    "kind": "InputValueDefinition",
    "name": {
      "kind": "Name",
      "value": "first"
    },
    "type": {
      "kind": "NamedType",
      "name": {
        "kind": "Name",
        "value": "Int"
      }
    },
    "directives": []
  }, {
    "kind": "InputValueDefinition",
    "name": {
      "kind": "Name",
      "value": "offset"
    },
    "type": {
      "kind": "NamedType",
      "name": {
        "kind": "Name",
        "value": "Int"
      }
    },
    "directives": []
  }];
  args.push.apply(args, neo4jArgs);
  return args;
};
var buildQueryType = function buildQueryType(key, obj, models) {
  return {
    "kind": "FieldDefinition",
    "name": {
      "kind": "Name",
      "value": key
    },
    "arguments": buildQueryTypeArguments(key, obj, models),
    "type": {
      "kind": "ListType",
      "type": {
        "kind": "NamedType",
        "name": {
          "kind": "Name",
          "value": key
        }
      }
    },
    "directives": [{
      "kind": "Directive",
      "name": {
        "kind": "Name",
        "value": "Neo4jGraphQLBinding"
      },
      "arguments": []
    }]
  };
};
var buildMutationTypeArguments = function buildMutationTypeArguments(modelName, definition, models) {
  var args = [];
  var arr = definition.fields;
  var len = arr.length;
  var i = 0;
  var obj = {};
  var name = {};
  var type = {};
  for (; i < len; ++i) {
    obj = arr[i];
    name = obj.name;
    type = obj.type;
    if (!isModelType(obj, models)) {
      args.push({
        "kind": "InputValueDefinition",
        "name": {
          "kind": "Name",
          "value": name.value
        },
        "type": type,
        "directives": []
      });
    }
  }
  return args;
};
var transformPropertyFields = function transformPropertyFields(modelAST) {
  var transformed = [];
  var fields = modelAST.fields;
  var fieldName = "";
  fields.forEach(function (field) {
    if (!isRelation(field)) {
      fieldName = field.name.value;
      transformed.push(fieldName + ": {" + fieldName + "}");
    }
  });
  return transformed.join(', ');
};
var getRelationDirectiveInfo = function getRelationDirectiveInfo(field) {
  var directives = field.directives;
  var relationDirective = {};
  directives.forEach(function (directive) {
    if (directive.name.value === "relation") {
      relationDirective = directive;
    }
  });
  var args = relationDirective.arguments;
  var relationDirectiveInfo = {};
  var relationArg = {};
  var nameArg = {};
  args.forEach(function (arg) {
    if (arg.name.value === "name") {
      relationDirectiveInfo.name = arg.value.value;
    } else if (arg.name.value === "direction") {
      relationDirectiveInfo.direction = arg.value.value;
    }
  });
  return relationDirectiveInfo;
};
var getUniqueFieldsOfModel = function getUniqueFieldsOfModel(model) {
  var relationFieldTypeUniqueFields = [];
  var fields = model.fields;
  var fieldName = "";
  fields.forEach(function (field) {
    fieldName = field.name.value;
    if (hasDirective(field, "unique") || hasDirective(field, "isUnique")) {
      relationFieldTypeUniqueFields.push(fieldName);
    }
  });
  if (relationFieldTypeUniqueFields.indexOf("id") === -1) {
    relationFieldTypeUniqueFields.unshift("id");
  }
  return relationFieldTypeUniqueFields;
};
var buildCypherDirectiveStatement = function buildCypherDirectiveStatement(_ref8) {
  var action = _ref8.action,
      modelName = _ref8.modelName,
      field = _ref8.field,
      modelAST = _ref8.modelAST,
      relationFieldName = _ref8.relationFieldName,
      models = _ref8.models,
      relationFieldType = _ref8.relationFieldType;

  var statement = "";
  switch (action) {
    case "create":
      {
        statement = "CREATE (n: " + modelName + " { " + transformPropertyFields(modelAST) + " }) RETURN n";
        break;
      }
    case "connect":
      {
        // Get unique fields of both this model and the model type the relation connects to / from
        var relatedModel = models[relationFieldType];
        var relationFieldTypeUniqueFields = getUniqueFieldsOfModel(relatedModel.def);
        var thisFieldTypeUniqueFields = getUniqueFieldsOfModel(modelAST);
        // Get relation info
        var relationDirectiveInfo = getRelationDirectiveInfo(field);
        var relationName = relationDirectiveInfo.name;
        var relationDirection = relationDirectiveInfo.direction;
        if (relationDirection === "OUT") {
          statement = "\n          MATCH (root: " + modelName + ") WHERE " + uniqueFieldComparisonDisjunction("root", modelName, thisFieldTypeUniqueFields, "{where}") + "\n          UNWIND {" + relationFieldName + "} AS _" + relationFieldName + "\n          MATCH (_" + modelName + "Node: " + relationFieldType + ") WHERE " + uniqueFieldComparisonDisjunction("_" + modelName + "Node", relationFieldName, relationFieldTypeUniqueFields, "_" + relationFieldName) + "\n          CREATE UNIQUE (root)-[relation: " + relationName + "]->(_" + modelName + "Node)\n          RETURN true\n        ";
        } else if (relationDirection === "IN") {
          statement = "\n        MATCH (root: " + modelName + ") WHERE " + uniqueFieldComparisonDisjunction("root", modelName, thisFieldTypeUniqueFields, "{where}") + "\n        UNWIND {" + relationFieldName + "} AS _" + relationFieldName + "\n        MATCH (_" + modelName + "Node: " + relationFieldType + ") WHERE " + uniqueFieldComparisonDisjunction("_" + modelName + "Node", relationFieldName, relationFieldTypeUniqueFields, "_" + relationFieldName) + "\n        CREATE UNIQUE (root)<-[relation: " + relationName + "]-(_" + modelName + "Node)\n        RETURN true\n        ";
        }
        // else if(relationDirection === "BOTH") {
        // TODO
        // }
        break;
      }
    default:
      {
        break;
      }
  }
  statement = statement.replace(/\n/g, " ");
  return statement;
};
var uniqueFieldComparisonDisjunction = function uniqueFieldComparisonDisjunction(nodeVariableName, modelName, uniqueFields, toMatch) {
  var statements = [];
  uniqueFields.forEach(function (fieldName) {
    statements.push(nodeVariableName + "." + fieldName + " = " + toMatch + "." + fieldName);
  });
  return statements.join(" OR ");
};
var capitalizeName = function capitalizeName(name) {
  return name.charAt(0).toUpperCase() + name.substr(1);
};
var buildMutationType = function buildMutationType(action, modelName, mutations, modelAST, models, isForRemote) {
  // Prevent overwriting any existing mutation of the same name
  if (mutations.fieldMap["" + action + modelName] === undefined) {
    switch (action) {
      case "create":
        {
          var directives = [];
          if (!isForRemote) {
            // Add local directive to be used in inferring which mutations
            // have been generated
            directives.push({
              "kind": "Directive",
              "name": {
                "kind": "Name",
                "value": "Neo4jGraphQLBinding"
              },
              "arguments": []
            });
          } else {
            // Add cypher directive for mutation sent with IDL
            directives.push({
              "kind": "Directive",
              "name": {
                "kind": "Name",
                "value": "cypher"
              },
              "arguments": [{
                "kind": "Argument",
                "name": {
                  "kind": "Name",
                  "value": "statement"
                },
                "value": {
                  "kind": "StringValue",
                  "value": buildCypherDirectiveStatement({
                    action: action,
                    modelName: modelName,
                    modelAST: modelAST
                  }),
                  "block": false
                }
              }]
            });
          }
          if (!isForRemote) {
            return [{
              "kind": "FieldDefinition",
              "name": {
                "kind": "Name",
                "value": "" + action + modelName
              },
              "arguments": [{
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "data"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "" + modelName + (action.charAt(0).toUpperCase() + action.substr(1)) + "Input"
                    }
                  }
                },
                "directives": []
              }],
              "type": {
                "kind": "NamedType",
                "name": {
                  "kind": "Name",
                  "value": modelName
                }
              },
              "directives": directives
            }];
          }
          break;
        }
      case "connect":
        {
          var _directives = [];
          if (isForRemote) {
            var fieldName = "";
            var relationFieldType = "";
            var relationMutations = [];
            modelAST.fields.forEach(function (field) {
              if (hasDirective(field, "relation")) {
                fieldName = field.name.value;
                relationFieldType = getFieldType(field);
                if (relationFieldType) {
                  var each = {
                    "kind": "FieldDefinition",
                    "name": {
                      "kind": "Name",
                      "value": "add" + modelName + capitalizeName(fieldName)
                    },
                    "arguments": [{
                      "kind": "InputValueDefinition",
                      "name": {
                        "kind": "Name",
                        "value": "where"
                      },
                      "type": {
                        "kind": "NonNullType",
                        "type": {
                          "kind": "NamedType",
                          "name": {
                            "kind": "Name",
                            "value": modelName + "WhereUniqueInput"
                          }
                        }
                      },
                      "directives": []
                    }, {
                      "kind": "InputValueDefinition",
                      "name": {
                        "kind": "Name",
                        "value": "" + fieldName
                      },
                      "type": {
                        "kind": "NonNullType",
                        "type": {
                          "kind": "ListType",
                          "type": {
                            "kind": "NonNullType",
                            "type": {
                              "kind": "NamedType",
                              "name": {
                                "kind": "Name",
                                "value": relationFieldType + "WhereUniqueInput"
                              }
                            }
                          }
                        }
                      },
                      "directives": []
                    }],
                    "type": {
                      "kind": "NamedType",
                      "name": {
                        "kind": "Name",
                        "value": "Boolean"
                      }
                    },
                    "directives": [{
                      "kind": "Directive",
                      "name": {
                        "kind": "Name",
                        "value": "cypher"
                      },
                      "arguments": [{
                        "kind": "Argument",
                        "name": {
                          "kind": "Name",
                          "value": "statement"
                        },
                        "value": {
                          "kind": "StringValue",
                          "value": buildCypherDirectiveStatement({
                            action: action,
                            field: field,
                            modelName: modelName,
                            modelAST: modelAST,
                            models: models,
                            relationFieldName: fieldName,
                            relationFieldType: relationFieldType
                          }),
                          "block": false
                        }
                      }]
                    }]
                  };
                  relationMutations.push(each);
                }
              }
            });
            return relationMutations;
          }
          break;
        }
      default:
        {
          break;
        }
    }
  }
  return undefined;
};
var buildEnumValues = function buildEnumValues(definition, models) {
  var values = [];
  var arr = definition.fields;
  var len = arr.length;
  var i = 0;
  var obj = {};
  var name = {};
  var type = {};
  for (; i < len; ++i) {
    obj = arr[i];
    name = obj.name;
    if (!isModelType(obj, models)) {
      values.push({
        "kind": "EnumValueDefinition",
        "name": {
          "kind": "Name",
          "value": name.value + "_asc"
        },
        "directives": []
      });
      values.push({
        "kind": "EnumValueDefinition",
        "name": {
          "kind": "Name",
          "value": name.value + "_desc"
        },
        "directives": []
      });
    }
  }
  return values;
};
var buildOrderingType = function buildOrderingType(key, obj, models) {
  return {
    "kind": "EnumTypeDefinition",
    "name": {
      "kind": "Name",
      "value": "_" + key + "Ordering"
    },
    "directives": [],
    "values": buildEnumValues(obj, models)
  };
};
var buildFilterType = function buildFilterType(modelName, model, models) {
  return (0, _graphql.parse)("\n  input _" + modelName + "Filter {\n    AND: [_" + modelName + "Filter!]\n    OR: [_" + modelName + "Filter!]\n    " + buildFilterTypeFields(modelName, model, models) + "\n  }\n  ");
};
var buildFieldMap = function buildFieldMap(arr) {
  var len = arr.length;
  var i = 0;
  var obj = {};
  var fieldMap = {};
  for (; i < len; ++i) {
    obj = arr[i];
    fieldMap[obj.name.value] = obj;
  }
  return fieldMap;
};
var buildObjectTypeDefinition = function buildObjectTypeDefinition(_ref9) {
  var name = _ref9.name;

  return {
    "kind": "ObjectTypeDefinition",
    "name": {
      "kind": "Name",
      "value": name
    },
    "interfaces": [],
    "directives": [],
    "fields": []
  };
};
var buildOperationTypeDefinition = function buildOperationTypeDefinition(_ref10) {
  var operation = _ref10.operation,
      name = _ref10.name;

  return {
    "kind": "OperationTypeDefinition",
    "operation": operation,
    "type": {
      "kind": "NamedType",
      "name": {
        "kind": "Name",
        "value": name
      }
    }
  };
};
var isSchemaDefinition = function isSchemaDefinition(def) {
  return def && def.kind === "SchemaDefinition";
};
var isModelType = function isModelType(field, models) {
  return models[getFieldType(field)];
};
var buildFilterTypeFields = function buildFilterTypeFields(modelName, model, models) {
  var fields = model.fields;
  var filterFields = [];
  var fieldName = "";
  var fieldType = "";
  fields.forEach(function (field) {
    fieldName = field.name.value;
    fieldType = getFieldType(field);
    if (isRelation(field)) {
      filterFields.push("\n" + fieldName + ": _" + fieldType + "Filter\n" + fieldName + "_not: _" + fieldType + "Filter\n" + fieldName + "_in: _" + fieldType + "Filter\n" + fieldName + "_not_in: _" + fieldType + "Filter\n" + fieldName + "_some: _" + fieldType + "Filter\n" + fieldName + "_none: _" + fieldType + "Filter\n" + fieldName + "_single: _" + fieldType + "Filter\n" + fieldName + "_every: _" + fieldType + "Filter\n");
    } else {
      filterFields.push("\n" + fieldName + ": " + fieldType + "\n" + fieldName + "_not: " + fieldType + "\n" + fieldName + "_in: [" + fieldType + "!]\n" + fieldName + "_not_in: [" + fieldType + "!]\n" + fieldName + "_lt: " + fieldType + "\n" + fieldName + "_lte: " + fieldType + "\n" + fieldName + "_gt: " + fieldType + "\n" + fieldName + "_gte: " + fieldType + "\n" + fieldName + "_contains: " + fieldType + "\n" + fieldName + "_not_contains: " + fieldType + "\n" + fieldName + "_starts_with: " + fieldType + "\n" + fieldName + "_not_starts_with: " + fieldType + "\n" + fieldName + "_ends_with: " + fieldType + "\n" + fieldName + "_not_ends_with: " + fieldType + "\n");
    }
  });
  return filterFields.join('\n');
};