import { parse, print } from 'graphql';

export const buildTypeDefs = ({
  typeDefs,
  query=true,
  mutation=true,
  idFields=true,
  isForRemote=false
}) => {
  let parsed = parse(typeDefs);
  const typeMaps = buildTypeMaps(parsed);
  const types = typeMaps.types;
  const models = typeMaps.models;
  parsed = possiblyBuildSchemaDefinition(parsed, typeMaps, query, mutation);
  parsed = possiblyBuildOperationTypes(parsed, typeMaps, query, mutation);
  const operationMaps = buildOperationMap(parsed);
  const queries = operationMaps.queries;
  const mutations = operationMaps.mutations;
  let model = {};
  let orderingType = {};
  let filterType = {};
  let modelType = {};
  let queryType = {};
  let mutationType = {};
  let relationalFieldInputTypes = {};
  let relationMutations = [];
  Object.keys(models).forEach(modelName => {
    model = models[modelName];
    // Local: Used in the graphql validation of client requests
    if(!isForRemote) {
      // Possibly inject id field
      if(idFields === true) model.def = injectIdField(modelName, model.def);
      // Build model type with field arguments for nested query support
      modelType = buildModelType(modelName, model.def, models);
      parsed.definitions[model.index] = modelType;
      // Build query type
      if(query && queries && queries.fieldMap && !queries.fieldMap[modelName]) {
        queryType = buildQueryType(modelName, model.def, models);
        parsed.definitions[queries.index].fields.push(queryType);
      }
      // Build ordering input type to be used in query field arguments
      orderingType = buildOrderingType(modelName, model.def, models);
      parsed.definitions.push(orderingType);
      // Build filter input type used in filter argument of neo4j-graphql query types
      filterType = buildFilterType(modelName, model.def, models);
      parsed.definitions.push(filterType);``
    }
    else {
      // REMOTE typeDefs
      parsed.definitions[model.index].fields = augmentRemoteModelFields(modelName, model.def, models);
    }
    // Built for both local and remote
    // These are the input types needed for the creation of One or Many types
    // when using nested mutations, e.g., PersonCreateOneInput / PersonCreateManyInput
    // Build query types for both local and remote
    // If isForRemote, then add cypher directive statements
    // so the IDL call overwrites the neo4j-graphql generated mutations, for now
    if(mutation && mutations && mutations.fieldMap && !mutations.fieldMap[modelName]) {
      relationalFieldInputTypes = buildRelationalFieldNestedInputTypes({
        action: "create",
        modelName: modelName,
        isForRemote: isForRemote
      });
      parsed.definitions.push(...relationalFieldInputTypes);

      relationalFieldInputTypes = buildRelationalFieldNestedInputTypes({
        action: "connect",
        modelName: modelName,
        isForRemote: isForRemote
      });
      parsed.definitions.push(...relationalFieldInputTypes);

      // Build CREATE mutation
      mutationType = buildMutationType("create", modelName, mutations, model.def, models, isForRemote);
      if(mutationType) parsed.definitions[mutations.index].fields.push(...mutationType);

      // Build CONNECT mutation
      mutationType = buildMutationType("connect", modelName, mutations, model.def, models, isForRemote);
      if(mutationType) parsed.definitions[mutations.index].fields.push(...mutationType);

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
  return print(parsed);
}
export const buildResolvers = ({ typeDefs, resolvers, query, mutation, bindingKey="neo4j" }) => {
  if(typeDefs === undefined) { throw Error(`buildNeo4jResolvers: typeDefs are undefined.`); }
  if(resolvers === undefined) { throw Error(`buildNeo4jResolvers: resolvers are undefined.`); }
  let augmentedResolvers = {};
  const parsed = parse(typeDefs);
  const operationMaps = buildOperationMap(parsed);
  if(!resolvers) { resolvers = {}; }
  const queries = operationMaps.queries;
  query = typeof query == "boolean" ? query : true;
  mutation = typeof mutation == "boolean" ? mutation : true;
  if(typeof bindingKey !== "string") { throw Error(`buildNeo4jResolvers: bindingKey must be a String value.`); }
  if(query && queries && queries.fieldMap) {
    if(augmentedResolvers.Query === undefined) { augmentedResolvers.Query = {}; }
    let queryTypeAST = {};
    Object.keys(queries.fieldMap).forEach(queryType => {
      queryTypeAST = queries.fieldMap[queryType];
      if(hasDirective(queryTypeAST, "cypher") || hasDirective(queryTypeAST, "Neo4jGraphQLBinding")) {
        if(resolvers.Query === undefined || resolvers.Query[queryType] === undefined) {
          augmentedResolvers.Query[queryType] = function(obj, params, ctx, info) {
            return ctx[bindingKey].query[info.fieldName](params, info);
          }
        }
      }
    });
  }
  const mutations = operationMaps.mutations;
  if(mutation && mutations && mutations.fieldMap) {
    if(augmentedResolvers.Mutation === undefined) { augmentedResolvers.Mutation = {}; }
    let mutationTypeAST = {};
    Object.keys(mutations.fieldMap).forEach(mutationType => {
      mutationTypeAST = mutations.fieldMap[mutationType];
      if(hasDirective(mutationTypeAST, "cypher") || hasDirective(mutationTypeAST, "Neo4jGraphQLBinding")) {
        if(resolvers.Mutation === undefined || resolvers.Mutation[mutationType] === undefined) {
          augmentedResolvers.Mutation[mutationType] = function(obj, params, ctx, info){
            return ctx[bindingKey].mutation[info.fieldName](params, info);
          }
        }
      }
    });
  }
  return augmentedResolvers;
}
export const getOperationTypes = (parsed) => {
  const arr = parsed ? parsed.definitions : [];
  const len = arr.length;
  let i = 0;
  let obj = {};
  let query = false;
  let mutation = false;
  for(; i < len; ++i) {
    obj = arr[i];
    if(isObjectType(obj)) {
      if(obj.name.value === "Query") {
        query = obj;
      }
      else if(obj.name.value === "Mutation") {
        mutation = obj;
      }
    }
  }
  return {
    query: query,
    mutation: mutation
  };
};
export const buildRelationalFieldNestedInputTypes = ({ action, modelName, isForRemote }) => {
  const inputs = [];
  // TODO only add those you need, check the arity of the value...
  switch(action) {
    case "create": {
      inputs.push({
        "kind": "InputObjectTypeDefinition",
        "name": {
          "kind": "Name",
          "value": `${modelName}CreateManyInput`
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
                    "value": `${modelName}CreateInput`
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
                    "value": `${modelName}WhereUniqueInput`
                  }
                }
              }
            },
            "directives": []
          },

        ]
      });
      inputs.push({
        "kind": "InputObjectTypeDefinition",
        "name": {
          "kind": "Name",
          "value": `${modelName}CreateOneInput`
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
                "value": `${modelName}CreateInput`
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
                "value": `${modelName}WhereUniqueInput`
              }
            },
            "directives": []
          },

        ]
      });
      break;
    }
    case "connect": {
      inputs.push({
        "kind": "InputObjectTypeDefinition",
        "name": {
          "kind": "Name",
          "value": `${modelName}ConnectManyInput`
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
                    "value": `${modelName}WhereUniqueInput`
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
                    "value": `${modelName}CreateInput`
                  }
                }
              }
            },
            "directives": []
          },

        ]
      });
      inputs.push({
        "kind": "InputObjectTypeDefinition",
        "name": {
          "kind": "Name",
          "value": `${modelName}ConnectOneInput`
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
                "value": `${modelName}WhereUniqueInput`
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
                "value": `${modelName}CreateInput`
              }
            },
            "directives": []
          },

        ]
      });
    }
    default: {
      break;
    }
  }
  return inputs;
};
export const buildNestedMutationInputType = ({ action, modelName, modelAST, mutations, isForRemote }) => {
  // Prevent overwriting any existing mutation of the same name
  if(mutations.fieldMap[`${action}${modelName}`] === undefined) {
    const inputFields = [];
    let relatedModelName = "";
    let arity = "";
    let fieldName = "";
    modelAST.fields.forEach(field => {
      fieldName = field.name.value;
      // computed fields using cypher directives are not used
      if(!hasDirective(field, "cypher")) {
        switch(action) {
          case "create": {
            // Do not use "id" field unless for remote typeDefs
            if(isForRemote || fieldName !== "id") {
              if(isRelation(field)) {
                relatedModelName = getFieldType(field);
                arity = "One";
                if(isListType(field) && relatedModelName) { arity = "Many"; }
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
                      "value": `${relatedModelName}Create${arity}Input`
                    }
                  },
                  "directives": []
                });
              }
              else {
                field.kind = "InputValueDefinition";
                inputFields.push(field);
              }
            }
            break;
          }
          case "connect": {
            if(fieldName === "id" || hasDirective(field, "unique") || hasDirective(field, "isUnique")) {
              const fieldType = getFieldType(field);
              let type = {
                "kind": "NamedType",
                "name": {
                  "kind": "Name",
                  "value": fieldType
                }
              };
              if(isListType(field)) {
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
          default: {
            break;
          }
        }
      }
    });
    switch(action) {
      case "create": {
        return {
          "kind": "InputObjectTypeDefinition",
          "name": {
            "kind": "Name",
            "value": `${modelName}CreateInput`
          },
          "directives": [],
          "fields": inputFields
        };
      }
      case "connect": {
        return {
          "kind": "InputObjectTypeDefinition",
          "name": {
            "kind": "Name",
            "value": `${modelName}WhereUniqueInput`
          },
          "directives": [],
          "fields": inputFields
        };
      }
      default: {
        break;
      }
    }
  }
  return undefined;
}
export const buildTypeMaps = (parsed) => {
  const arr = parsed ? parsed.definitions : [];
  const len = arr.length;
  let i = 0;
  let definition = {};
  let name = "";
  const models = {};
  const types = {};
  for(; i < len; ++i) {
    definition = arr[i];
    if(isObjectType(definition)) {
      if(isModel(definition)) {
        definition = reduceNestedListTypes(definition);
        if(!models[definition.name.value]) {
          models[definition.name.value] = {
            index: i,
            def: definition
          };
        }
      }
      else if(definition.name.value !== "Query" && definition.name.value !== "Mutation") {
        if(!types[definition.name.value]) {
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
export const buildOperationMap = (parsed) => {
  const arr = parsed ? parsed.definitions : [];
  const len = arr.length;
  let i = 0;
  let obj = {};
  let name = "";
  let queries = undefined;
  let mutations = undefined;
  for(; i < len; ++i) {
    obj = arr[i];
    if(isObjectType(obj)) {
      if(obj.name.value === "Query") {
        queries = {
          index: i,
          fieldMap: buildFieldMap(obj.fields)
        };
      }
      else if(obj.name.value === "Mutation") {
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
export const getNamedType = (definition) => {
  let type = definition.type;
  while(type.kind !== "NamedType") type = type.type;
  return type;
}
export const getFieldType = (field) => {
  return field ? getNamedType(field).name.value : undefined;
}

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
const injectIdField = (modelName, model) => {
  const len = model.fields.length;
  let idField = undefined;
  let idFieldIndex = -1;
  let i = 0;
  let field = {};
  for(; i < len; ++i) {
    field = model.fields[i];
    if(field.name.value === "id") {
      idField = field;
      idFieldIndex = i;
    }
  }
  if(idField) {
    const printed = print(idField);
    // If it isn't either of these two patterns, error
    if(printed !== "id: ID! @unique" && printed !== "id: ID! @isUnique") {
      throw Error(`id field on type ${modelName} has invalid format '${printed}' Required format: 'id: ID!'`);
    }
    // Otherwise, if id field exists but is not the first field
    if(idFieldIndex > 0) {
      // then remove it
      model.fields.splice(idFieldIndex, 1);
      // and make it the first field
      model.fields.unshift(idField);
    }
  }
  else {
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
      "directives": [
        {
          "kind": "Directive",
          "name": {
            "kind": "Name",
            "value": "unique"
          },
          "arguments": []
        }
      ]
    });
  }
  return model;
}
const buildRelationMutations = ({ action, modelAST, modelName, mutations }) => {
  const relationMutations = [];
  let fieldName = "";
  modelAST.fields.forEach(field => {
    if(isRelation(field)) {
      fieldName = field.name.value;
      const capitalized = fieldName.charAt(0).toUpperCase() + fieldName.substr(1);
      const relationMutationName = `${action}${modelName}${capitalized}`;
      // Prevent overwriting any existing mutation of the same name
      if(mutations.fieldMap[relationMutationName] === undefined) {
        if(action === "add") {
          relationMutations.push({
            "kind": "FieldDefinition",
            "name": {
              "kind": "Name",
              "value": relationMutationName
            },
            "arguments": [
              {
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
              },
              {
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
              }
            ],
            "type": {
              "kind": "NamedType",
              "name": {
                "kind": "Name",
                "value": "String"
              }
            },
            "directives": [
              {
                "kind": "Directive",
                "name": {
                  "kind": "Name",
                  "value": "Neo4jGraphQLBinding"
                },
                "arguments": []
              }
            ]
          });
        }
      }
    }
  });
  return relationMutations;
}
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
const isObjectType = (def) => {
  return def && def.kind === "ObjectTypeDefinition";
};
const isModel = (def) => {
  const directives = def.directives ? def.directives : [];
  const len = directives.length;
  let d = 0;
  let directive = {};
  let name = "";
  let isModel = false;
  for(; d < len; ++d) {
    directive = directives[d];
    name = directive.name.value;
    if(name === "model") {
      isModel = true;
    }
  }
  return isModel;
};
const possiblyBuildSchemaDefinition = (parsed, typeMaps, queries, mutations) => {
  if(Object.keys(typeMaps.models).length > 0) {
    const schemaDefinition = getSchemaDefinition(parsed);
    if(schemaDefinition && schemaDefinition.def && schemaDefinition.index >= 0) {
      const schemaDefOperationIndex = schemaDefinition.index;
      const operationTypes = schemaDefinition.def.operationTypes;
      let query = false;
      let mutation = false;
      operationTypes.forEach(operation => {
        if(operation.operation === "query" && operation.type.name.value === "Query") {
          query = true;
        }
        else if(operation.operation === "mutation" && operation.type.name.value === "Mutation") {
          mutation = true;
        }
      });
      if(!query && queries) {
        parsed.definitions[schemaDefOperationIndex].operationTypes.push(buildOperationTypeDefinition({
          operation: "query",
          name: "Query"
        }));
      }
      if(!mutation && mutations) {
        parsed.definitions[schemaDefOperationIndex].operationTypes.push(buildOperationTypeDefinition({
          operation: "mutation",
          name: "Mutation"
        }));
      }
    }
    else if(schemaDefinition === undefined) {
      parsed.definitions.push(buildSchemaDefinition({
        query: queries,
        mutation: mutations
      }));
    }
  }
  return parsed;
};
const possiblyBuildOperationTypes = (parsed, typeMaps, queries, mutations) => {
  if(Object.keys(typeMaps.models).length > 0) {
    const operationTypes = getOperationTypes(parsed);
    if(!operationTypes.query && queries) {
      parsed.definitions.push(buildObjectTypeDefinition({
        name: "Query"
      }));
    }
    if(!operationTypes.mutation && mutations) {
      parsed.definitions.push(buildObjectTypeDefinition({
        name: "Mutation"
      }));
    }
  }
  return parsed;
};
const reduceNestedListTypes = (model) => {
  const fields = model.fields;
  const len = fields.length;
  let f = 0;
  let field = {};
  for(; f < len; ++f) {
    field = fields[f];
    if(field.type.kind === "ListType") {
      fields[f] = reduceListTypes(field);
    }
  }
  return model;
}
const getSchemaDefinition = (parsed) => {
  const defs = parsed ? parsed.definitions : [];
  const len = defs.length;
  let i = 0;
  for(; i < len; ++i) {
    if(isSchemaDefinition(defs[i])) {
      return {
        def: defs[i],
        index: i
      };
    }
  }
  return undefined;
};
const buildSchemaDefinition = ({ query, mutation }) => {
  if(!query && !mutation) return undefined;
  return {
    "kind": "SchemaDefinition",
    "directives": [],
    "operationTypes": operationTypes({
      query: query,
      mutation: mutation
    })
  }
};
const operationTypes = ({ query, mutation }) => {
  const operationTypes = [];
  if(query) {
    operationTypes.push(buildOperationTypeDefinition({
      operation: "query",
      name: "Query"
    })
  );
  }
  if(mutation) {
    operationTypes.push(buildOperationTypeDefinition({
      operation: "mutation",
      name: "Mutation"
    }));
  }
  return operationTypes;
};
const reduceListTypes = (field) => {
  if(field.type.kind === "ListType" && field.type.type && field.type.type.kind === "ListType") {
    const namedType = getNamedType(field);
    field.type = {
      kind: "ListType",
      type: namedType
    };
  }
  return field;
}
const buildModelFields = (modelName, definition, models) => {
  const modelFields = [{
    "kind": "FieldDefinition",
    "name": {
      "kind": "Name",
      "value": "_id",
    },
    "arguments": [],
    "type": {
      "kind": "NamedType",
      "name": {
        "kind": "Name",
        "value": "Int",
      },
    },
    "directives": [],
  }];
  let arr = definition.fields;
  let len = arr.length;
  let i = 0;
  let obj = {};
  let name = {};
  let type = {};
  for(; i < len; ++i) {
    obj = arr[i];
    name = obj.name;
    type = obj.type;
    if(isModelType(obj, models)) {
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
    }
    else {
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
const augmentRemoteModelFields = (modelName, definition, models) => {
  let fields = definition.fields;
  let len = fields.length;
  let i = 0;
  let obj = {};
  let name = {};
  let type = {};
  let idField = undefined;
  let idFieldIndex = -1;
  for(; i < len; ++i) {
    obj = fields[i];
    name = obj.name;
    type = obj.type;
    if(name.value === "id") {
      idField = obj;
      idFieldIndex = i;
    }
  }
  if(idField) {
    const printed = print(idField);
    // If it isn't either of these two patterns, error
    if(printed !== "id: ID! @unique" && printed !== "id: ID! @isUnique") {
      throw Error(`id field on type ${modelName} has invalid format '${printed}' Required format: 'id: ID!'`);
    }
    // Otherwise, if id field exists but is not the first field
    if(idFieldIndex > 0) {
      // then remove it
      fields.splice(idFieldIndex, 1);
      // and make it the first field
      fields.unshift(idField);
    }
  }
  else {
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
const possiblyRemoveNonNullType = (type) => {
  if(type.kind === "NonNullType") {
    type = type.type;
  }
  return type;
}
const buildModelFieldArguments = (modelName, field, models) => {
    const kind = field.type.kind;
    const relatedModelType = getFieldType(field);
    const neo4jArgsForNamedType = [
      {
        "kind": "InputValueDefinition",
        "name": {
          "kind": "Name",
          "value": "orderBy",
        },
        "type": {
          "kind": "ListType",
          "type": {
            "kind": "NamedType",
            "name": {
              "kind": "Name",
              "value": `_${relatedModelType}Ordering`,
            },
          },
        },
        "directives": [],
      },
      {
        "kind": "InputValueDefinition",
        "name": {
          "kind": "Name",
          "value": "filter",
        },
        "type": {
          "kind": "ListType",
          "type": {
            "kind": "NamedType",
            "name": {
              "kind": "Name",
              "value": `_${relatedModelType}Filter`,
            },
          },
        },
        "directives": [],
      }
    ];
    const neo4jArgsForListType = [
      {
        "kind": "InputValueDefinition",
        "name": {
          "kind": "Name",
          "value": "filter",
        },
        "type": {
          "kind": "ListType",
          "type": {
            "kind": "NamedType",
            "name": {
              "kind": "Name",
              "value": `_${relatedModelType}Filter`,
            },
          },
        },
        "directives": [],
      },
      {
        "kind": "InputValueDefinition",
        "name": {
          "kind": "Name",
          "value": "orderBy",
        },
        "type": {
          "kind": "ListType",
          "type": {
            "kind": "NamedType",
            "name": {
              "kind": "Name",
              "value": `_${relatedModelType}Ordering`,
            },
          },
        },
        "directives": [],
      },
      {
        "kind": "InputValueDefinition",
        "name": {
          "kind": "Name",
          "value": "_id",
        },
        "type": {
          "kind": "NamedType",
          "name": {
            "kind": "Name",
            "value": "Int",
          },
        },
        "directives": [],
      },
      {
        "kind": "InputValueDefinition",
        "name": {
          "kind": "Name",
          "value": "_ids",
        },
        "type": {
          "kind": "ListType",
          "type": {
            "kind": "NamedType",
            "name": {
              "kind": "Name",
              "value": "Int",
            },
          },
        },
        "directives": [],
      },
      {
        "kind": "InputValueDefinition",
        "name": {
          "kind": "Name",
          "value": "first",
        },
        "type": {
          "kind": "NamedType",
          "name": {
            "kind": "Name",
            "value": "Int",
          },
        },
        "directives": [],
      },
      {
        "kind": "InputValueDefinition",
        "name": {
          "kind": "Name",
          "value": "offset",
        },
        "type": {
          "kind": "NamedType",
          "name": {
            "kind": "Name",
            "value": "Int",
          },
        },
        "directives": [],
      }
    ];
    const relatedModel = models[relatedModelType];
    if(relatedModel) {
      let args = [];
      let arr = relatedModel.def.fields;
      let len = arr.length;
      let i = 0;
      let obj = {};
      let name = {};
      let type = {};
      for(; i < len; ++i) {
        obj = arr[i];
        name = obj.name;
        type = obj.type;
        if(!isModelType(obj, models)) {
          type = possiblyRemoveNonNullType(type);
          args.push({
            "kind": "InputValueDefinition",
            "name": {
              "kind": "Name",
              "value": name.value,
            },
            "type": type,
            "directives": [],
          });
          args.push({
            "kind": "InputValueDefinition",
            "name": {
              "kind": "Name",
              "value": `${name.value}s`,
            },
            "type": {
              "kind": "ListType",
              "type": type
            },
            "directives": [],
          });
        }
      }
      if(kind === "ListType") {
        args.push(...neo4jArgsForListType);
      }
      else if(kind === "NamedType") {
        args.push(...neo4jArgsForNamedType);
      }
      return args;
    }
    return [];
};
const buildModelType = (modelName, obj, models) => {
  return {
    "kind": "ObjectTypeDefinition",
    "name": {
      "kind": "Name",
      "value": modelName,
    },
    "interfaces": [],
    "directives": [
      {
        "kind": "Directive",
        "name": {
          "kind": "Name",
          "value": "model"
        },
        "arguments": []
      }
    ],
    "fields": buildModelFields(modelName, obj, models)
  }
};
const buildQueryTypeArguments = (modelName, definition, models) => {
  let args = [];
  let arr = definition.fields;
  let len = arr.length;
  let i = 0;
  let obj = {};
  let name = {};
  let type = {};
  for(; i < len; ++i) {
    obj = arr[i];
    name = obj.name;
    type = obj.type;
    // Only add query arguments for non-relational fields
    // because those are otherwise handled by the generated field args
    // added to the model type
    if(!isModelType(obj, models)) {
      // Prevent NonNullType fields from being required on generated query types
      type = possiblyRemoveNonNullType(type);
      // Add argument for field
      args.push({
        "kind": "InputValueDefinition",
        "name": {
          "kind": "Name",
          "value": name.value,
        },
        "type": type,
        "directives": [],
      });
      // Add list type argument for field
      args.push({
        "kind": "InputValueDefinition",
        "name": {
          "kind": "Name",
          "value": `${name.value}s`,
        },
        "type": {
          "kind": "ListType",
          "type": type,
        },
        "directives": [],
      });
    }
  }
  // Add field group for auto generated query types
  const neo4jArgs = [
    {
      "kind": "InputValueDefinition",
      "name": {
        "kind": "Name",
        "value": "filter",
      },
      "type": {
        "kind": "NamedType",
        "name": {
          "kind": "Name",
          "value": `_${modelName}Filter`,
        },
      },
      "directives": [],
    },
    {
      "kind": "InputValueDefinition",
      "name": {
        "kind": "Name",
        "value": "orderBy",
      },
      "type": {
        "kind": "ListType",
        "type": {
          "kind": "NamedType",
          "name": {
            "kind": "Name",
            "value": `_${modelName}Ordering`,
          },
        },
      },
      "directives": [],
    },
    {
      "kind": "InputValueDefinition",
      "name": {
        "kind": "Name",
        "value": "_id",
      },
      "type": {
        "kind": "NamedType",
        "name": {
          "kind": "Name",
          "value": "Int",
        },
      },
      "directives": [],
    },
    {
      "kind": "InputValueDefinition",
      "name": {
        "kind": "Name",
        "value": "_ids",
      },
      "type": {
        "kind": "ListType",
        "type": {
          "kind": "NamedType",
          "name": {
            "kind": "Name",
            "value": "Int",
          },
        },
      },
      "directives": [],
    },
    {
      "kind": "InputValueDefinition",
      "name": {
        "kind": "Name",
        "value": "first",
      },
      "type": {
        "kind": "NamedType",
        "name": {
          "kind": "Name",
          "value": "Int",
        },
      },
      "directives": [],
    },
    {
      "kind": "InputValueDefinition",
      "name": {
        "kind": "Name",
        "value": "offset",
      },
      "type": {
        "kind": "NamedType",
        "name": {
          "kind": "Name",
          "value": "Int",
        },
      },
      "directives": [],
    }
  ];
  args.push(...neo4jArgs);
  return args;
};
const buildQueryType = (key, obj, models) => {
  return {
    "kind": "FieldDefinition",
    "name": {
      "kind": "Name",
      "value": key,
    },
    "arguments": buildQueryTypeArguments(key, obj, models),
    "type": {
      "kind": "ListType",
      "type": {
        "kind": "NamedType",
        "name": {
          "kind": "Name",
          "value": key,
        },
      },
    },
    "directives": [
      {
        "kind": "Directive",
        "name": {
          "kind": "Name",
          "value": "Neo4jGraphQLBinding"
        },
        "arguments": []
      }
    ]
  };
};
const buildMutationTypeArguments = (modelName, definition, models) => {
  let args = [];
  let arr = definition.fields;
  let len = arr.length;
  let i = 0;
  let obj = {};
  let name = {};
  let type = {};
  for(; i < len; ++i) {
    obj = arr[i];
    name = obj.name;
    type = obj.type;
    if(!isModelType(obj, models)) {
      args.push({
        "kind": "InputValueDefinition",
        "name": {
          "kind": "Name",
          "value": name.value,
        },
        "type": type,
        "directives": [],
      });
    }
  }
  return args;
};
const transformPropertyFields = (modelAST) => {
  const transformed = [];
  const fields = modelAST.fields;
  let fieldName = "";
  fields.forEach(field => {
    if(!isRelation(field)) {
      fieldName = field.name.value;
      transformed.push(`${fieldName}: {${fieldName}}`);
    }
  });
  return transformed.join(', ');
};
const getRelationDirectiveInfo = (field) => {
  const directives = field.directives;
  let relationDirective = {};
  directives.forEach(directive => {
    if(directive.name.value === "relation") {
      relationDirective = directive;
    }
  });
  const args = relationDirective.arguments;
  let relationDirectiveInfo = {};
  let relationArg = {};
  let nameArg = {};
  args.forEach(arg => {
    if(arg.name.value === "name") {
      relationDirectiveInfo.name = arg.value.value;
    }
    else if(arg.name.value === "direction") {
      relationDirectiveInfo.direction = arg.value.value;
    }
  });
  return relationDirectiveInfo;
};
const getUniqueFieldsOfModel = (model) => {
  const relationFieldTypeUniqueFields = [];
  const fields = model.fields;
  let fieldName = "";
  fields.forEach(field => {
    fieldName = field.name.value;
    if(hasDirective(field, "unique") || hasDirective(field, "isUnique")) {
      relationFieldTypeUniqueFields.push(fieldName);
    }
  })
  if(relationFieldTypeUniqueFields.indexOf("id") === -1) {
    relationFieldTypeUniqueFields.unshift("id");
  }
  return relationFieldTypeUniqueFields;
}
const buildCypherDirectiveStatement = ({ action, modelName, field, modelAST, relationFieldName, models, relationFieldType }) => {
  let statement = ``;
  switch(action) {
    case "create": {
      statement = `CREATE (n: ${modelName} { ${transformPropertyFields(modelAST)} }) RETURN n`;
      break;
    }
    case "connect": {
      // Get unique fields of both this model and the model type the relation connects to / from
      const relatedModel = models[relationFieldType];
      const relationFieldTypeUniqueFields = getUniqueFieldsOfModel(relatedModel.def);
      const thisFieldTypeUniqueFields = getUniqueFieldsOfModel(modelAST);
      // Get relation info
      const relationDirectiveInfo = getRelationDirectiveInfo(field);
      const relationName = relationDirectiveInfo.name;
      const relationDirection = relationDirectiveInfo.direction;
      if(relationDirection === "OUT") {
        statement = `
          MATCH (root: ${modelName}) WHERE ${uniqueFieldComparisonDisjunction("root", modelName, thisFieldTypeUniqueFields, `{where}`)}
          UNWIND {${relationFieldName}} AS _${relationFieldName}
          MATCH (_${modelName}Node: ${relationFieldType}) WHERE ${uniqueFieldComparisonDisjunction(`_${modelName}Node`, relationFieldName, relationFieldTypeUniqueFields, `_${relationFieldName}`)}
          CREATE UNIQUE (root)-[relation: ${relationName}]->(_${modelName}Node)
          RETURN true
        `;
      }
      else if(relationDirection === "IN") {
        statement = `
        MATCH (root: ${modelName}) WHERE ${uniqueFieldComparisonDisjunction("root", modelName, thisFieldTypeUniqueFields, `{where}`)}
        UNWIND {${relationFieldName}} AS _${relationFieldName}
        MATCH (_${modelName}Node: ${relationFieldType}) WHERE ${uniqueFieldComparisonDisjunction(`_${modelName}Node`, relationFieldName, relationFieldTypeUniqueFields, `_${relationFieldName}`)}
        CREATE UNIQUE (root)<-[relation: ${relationName}]-(_${modelName}Node)
        RETURN true
        `;
      }
      // else if(relationDirection === "BOTH") {
      // TODO
      // }
      break;
    }
    default: {
      break;
    }
  }
  statement = statement.replace(/\n/g, " ");
  return statement;
}
const uniqueFieldComparisonDisjunction = (nodeVariableName, modelName, uniqueFields, toMatch) => {
  const statements = [];
  uniqueFields.forEach(fieldName => {
    statements.push(`${nodeVariableName}.${fieldName} = ${toMatch}.${fieldName}`);
  });
  return statements.join(` OR `);
}
const capitalizeName = (name) => {
  return name.charAt(0).toUpperCase() + name.substr(1);
}
const buildMutationType = (action, modelName, mutations, modelAST, models, isForRemote) => {
  // Prevent overwriting any existing mutation of the same name
  if(mutations.fieldMap[`${action}${modelName}`] === undefined) {
    switch(action) {
      case "create": {
        const directives = [];
        if(!isForRemote) {
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
        }
        else {
          // Add cypher directive for mutation sent with IDL
          directives.push({
            "kind": "Directive",
            "name": {
              "kind": "Name",
              "value": "cypher"
            },
            "arguments": [
              {
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
              }
            ]
          });
        }
        if(!isForRemote) {
          return [{
            "kind": "FieldDefinition",
            "name": {
              "kind": "Name",
              "value": `${action}${modelName}`
            },
            "arguments": [
              {
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
                      "value": `${modelName}${action.charAt(0).toUpperCase() + action.substr(1)}Input`
                    }
                  }
                },
                "directives": []
              }
            ],
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
      case "connect": {
        const directives = [];
        if(isForRemote) {
          let fieldName = "";
          let relationFieldType = "";
          const relationMutations = [];
          modelAST.fields.forEach(field => {
            if(hasDirective(field, "relation")) {
              fieldName = field.name.value;
              relationFieldType = getFieldType(field);
              if(relationFieldType) {
                let each = {
                  "kind": "FieldDefinition",
                  "name": {
                    "kind": "Name",
                    "value": `add${modelName}${capitalizeName(fieldName)}`
                  },
                  "arguments": [
                    {
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
                            "value": `${modelName}WhereUniqueInput`
                          }
                        }
                      },
                      "directives": []
                    },
                    {
                      "kind": "InputValueDefinition",
                      "name": {
                        "kind": "Name",
                        "value": `${fieldName}`
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
                                "value": `${relationFieldType}WhereUniqueInput`
                              }
                            }
                          }
                        }
                      },
                      "directives": []
                    }
                  ],
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "Boolean"
                    }
                  },
                  "directives": [
                    {
                      "kind": "Directive",
                      "name": {
                        "kind": "Name",
                        "value": "cypher"
                      },
                      "arguments": [
                        {
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
                        }
                      ]
                    }
                  ]
                };
                relationMutations.push(each);
              }
            }
          });
          return relationMutations;
        }
        break;
      }
      default: {
        break;
      }
    }
  }
  return undefined;
};
const buildEnumValues = (definition, models) => {
  let values = [];
  let arr = definition.fields;
  let len = arr.length;
  let i = 0;
  let obj = {};
  let name = {};
  let type = {};
  for(; i < len; ++i) {
    obj = arr[i];
    name = obj.name;
    if(!isModelType(obj, models)) {
      values.push({
        "kind": "EnumValueDefinition",
        "name": {
          "kind": "Name",
          "value": `${name.value}_asc`,
        },
        "directives": [],
      });
      values.push({
        "kind": "EnumValueDefinition",
        "name": {
          "kind": "Name",
          "value": `${name.value}_desc`,
        },
        "directives": [],
      });
    }
  }
  return values;
};
const buildOrderingType = (key, obj, models) => {
  return {
    "kind": "EnumTypeDefinition",
    "name": {
      "kind": "Name",
      "value": `_${key}Ordering`,
    },
    "directives": [],
    "values": buildEnumValues(obj, models)
  }
};
const buildFilterType = (modelName, model, models) => {
  return parse(`
  input _${modelName}Filter {
    AND: [_${modelName}Filter!]
    OR: [_${modelName}Filter!]
    ${buildFilterTypeFields(modelName, model, models)}
  }
  `);
};
const buildFieldMap = (arr) => {
  const len = arr.length;
  let i = 0;
  let obj = {};
  const fieldMap = {};
  for(; i < len; ++i) {
    obj = arr[i];
    fieldMap[obj.name.value] = obj;
  }
  return fieldMap;
};
const buildObjectTypeDefinition = ({ name }) => {
  return {
    "kind": "ObjectTypeDefinition",
    "name": {
      "kind": "Name",
      "value": name,
    },
    "interfaces": [],
    "directives": [],
    "fields": [],
  };
};
const buildOperationTypeDefinition = ({ operation, name }) => {
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
const isSchemaDefinition = (def) => {
  return def && def.kind === "SchemaDefinition";
};
const isModelType = (field, models) => {
  return models[getFieldType(field)];
};
const buildFilterTypeFields = (modelName, model, models) => {
  const fields = model.fields;
  const filterFields = [];
  let fieldName = "";
  let fieldType = "";
  fields.forEach(field => {
    fieldName = field.name.value;
    fieldType = getFieldType(field);
    if(isRelation(field)) {
      filterFields.push(`
${fieldName}: _${fieldType}Filter
${fieldName}_not: _${fieldType}Filter
${fieldName}_in: _${fieldType}Filter
${fieldName}_not_in: _${fieldType}Filter
${fieldName}_some: _${fieldType}Filter
${fieldName}_none: _${fieldType}Filter
${fieldName}_single: _${fieldType}Filter
${fieldName}_every: _${fieldType}Filter
`);
    }
    else {
      filterFields.push(`
${fieldName}: ${fieldType}
${fieldName}_not: ${fieldType}
${fieldName}_in: [${fieldType}!]
${fieldName}_not_in: [${fieldType}!]
${fieldName}_lt: ${fieldType}
${fieldName}_lte: ${fieldType}
${fieldName}_gt: ${fieldType}
${fieldName}_gte: ${fieldType}
${fieldName}_contains: ${fieldType}
${fieldName}_not_contains: ${fieldType}
${fieldName}_starts_with: ${fieldType}
${fieldName}_not_starts_with: ${fieldType}
${fieldName}_ends_with: ${fieldType}
${fieldName}_not_ends_with: ${fieldType}
`);
    }
  });
  return filterFields.join('\n');
}
