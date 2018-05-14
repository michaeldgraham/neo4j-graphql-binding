import { parse, print } from 'graphql';

export const buildTypeDefs = ({ typeDefs, query, mutation }) => {
  let parsed = parse(typeDefs);
  const buildQueries = typeof query === "boolean" ? query : true;
  const buildMutations = typeof mutation === "boolean" ? mutation : true;
  const typeMaps = buildTypeMaps(parsed);
  parsed = possiblyBuildSchemaDefinition(parsed, typeMaps, buildQueries, buildMutations);
  parsed = possiblyBuildOperationTypes(parsed, typeMaps, buildQueries, buildMutations);
  const operationMaps = buildOperationMap(parsed);
  parsed = buildTypes(parsed, typeMaps, operationMaps);
  return print(parsed);
};
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

const buildTypes = (parsed, typeMaps, operationMaps) => {
  const types = typeMaps.types;
  const models = typeMaps.models;
  const queries = operationMaps.queries;
  const mutations = operationMaps.mutations;
  const arr = Object.keys(models);
  let i = 0;
  let obj = {};
  let key = "";
  const len = arr.length;
  let orderingType = {};
  let modelType = {};
  let queryType = {};
  let mutationType = {};
  for(; i < len; ++i) {
    key = arr[i];
    obj = models[key];
    if(queries && queries.fieldMap && !queries.fieldMap[key]) {

      modelType = buildModelType(key, obj.def, models);
      parsed.definitions[obj.index] = modelType;

      orderingType = buildOrderingType(key, obj.def, models);
      parsed.definitions.push(orderingType);

      queryType = buildQueryType(key, obj.def, models);
      parsed.definitions[queries.index].fields.push(queryType);

    }
    if(mutations && mutations.fieldMap && !mutations.fieldMap[`create${key}`]) {
      mutationType = buildMutationType(key, obj.def, models);
      parsed.definitions[mutations.index].fields.push(mutationType);
    }
  }
  return parsed;
}
const buildTypeMaps = (parsed) => {
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
        models[definition.name.value] = {
          index: i,
          def: definition
        };
      }
      else if(definition.name.value !== "Query" && definition.name.value !== "Mutation") {
        types[definition.name.value] = {
          index: i,
          def: definition
        };
      }
    }
  }
  return {
    models: models,
    types: types
  };
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
    else if(schemaDefinition === null) {
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
const buildOperationMap = (parsed) => {
  const arr = parsed ? parsed.definitions : [];
  const len = arr.length;
  let i = 0;
  let obj = {};
  let name = "";
  let queries = {};
  let mutations = {};
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
  return null;
};
const buildSchemaDefinition = ({ query, mutation }) => {
  if(!query && !mutation) return null;
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
const getNamedType = (definition) => {
  let type = definition.type;
  while(type.kind !== "NamedType") type = type.type;
  return type;
}
const getFieldValueType = (definition) => {
  const kind = definition.type.kind;
  let relatedModelType = "";
  if(kind === "NamedType") {
    relatedModelType = definition.type.name.value;
  }
  else if(kind === "ListType") {
    relatedModelType = definition.type.type.name.value;
  }
  return relatedModelType;
}
const possiblyRemoveNonNullType = (type) => {
  if(type.kind === "NonNullType") {
    type = type.type;
  }
  return type;
}
const buildModelFieldArguments = (modelName, field, models) => {
    const kind = field.type.kind;
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
              "value": `_${modelName}Ordering`,
            },
          },
        },
        "directives": [],
      },
    ];
    const neo4jArgsForListType = [
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
    const relatedModelType = getFieldValueType(field);
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
const buildModelType = (key, obj, models) => {
  return {
    "kind": "ObjectTypeDefinition",
    "name": {
      "kind": "Name",
      "value": key,
    },
    "interfaces": [],
    "directives": [],
    "fields": buildModelFields(key, obj, models)
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
    "directives": [],
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
const buildMutationType = (key, obj, models) => {
  return {
    "kind": "FieldDefinition",
    "name": {
      "kind": "Name",
      "value": `create${key}`,
    },
    "arguments": buildMutationTypeArguments(key, obj, models),
    "type": {
      "kind": "NamedType",
      "name": {
        "kind": "Name",
        "value": "String",
      },
    },
    "directives": [],
  };
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
  return models[getFieldValueType(field)];
};
